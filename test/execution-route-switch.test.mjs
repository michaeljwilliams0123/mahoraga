import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXECUTION_ROUTES, LOCAL_WINDOWS_LABELS, resolveExecutionRoute } from '../scripts/execution-route-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(path.join(root, name), 'utf8');

test('route matrix never assigns hosted minutes to private repositories', () => {
  assert.deepEqual(EXECUTION_ROUTES, ['auto', 'cloud', 'local', 'hold']);
  for (const privateRepo of [true, false]) {
    for (const privateStewardEnabled of [true, false]) {
      for (const localRunnerReady of [true, false]) {
        for (const mode of [...EXECUTION_ROUTES, '', 'unknown', 'paid']) {
          const result = resolveExecutionRoute({ requestedMode: mode, repositoryPrivate: privateRepo, privateStewardEnabled, localRunnerReady });
          assert.equal(result.paidFallback, false);
          assert.equal(result.automaticVisibilityChange, false);
          assert.equal(result.automaticCredentialOrRegistrationChange, false);
          if (privateRepo) assert.notEqual(result.steward.selected, 'public-hosted-ubuntu');
          if (result.steward.selected === 'local-windows') {
            assert.equal(privateRepo, true);
            assert.equal(privateStewardEnabled, true);
            assert.deepEqual(result.steward.requiredLabels, LOCAL_WINDOWS_LABELS);
          }
          if (!['', ...EXECUTION_ROUTES].includes(mode)) {
            assert.equal(result.steward.selected, 'held');
            assert.equal(result.sovereign.selected, 'held');
          }
        }
      }
    }
  }
});

test('default auto retains free public Steward plus existing local sovereign execution', () => {
  const current = resolveExecutionRoute({ repositoryPrivate: false, localRunnerReady: true });
  assert.equal(current.mode, 'auto');
  assert.equal(current.steward.selected, 'public-hosted-ubuntu');
  assert.equal(current.sovereign.selected, 'local-windows');
  const privateDisabled = resolveExecutionRoute({ repositoryPrivate: true, privateStewardEnabled: false });
  assert.equal(privateDisabled.steward.selected, 'held');
  assert.equal(privateDisabled.sovereign.state, 'queued-until-runner-online');
  const privateEnabled = resolveExecutionRoute({ repositoryPrivate: true, privateStewardEnabled: true, localRunnerReady: true });
  assert.equal(privateEnabled.steward.selected, 'local-windows');
  assert.equal(privateEnabled.steward.state, 'eligible');
});

test('cloud routes only free public Steward; local private routes only eligible zero-credit self-hosted jobs', () => {
  for (const privateRepo of [true, false]) {
    const cloud = resolveExecutionRoute({ requestedMode: 'cloud', repositoryPrivate: privateRepo, privateStewardEnabled: true });
    assert.equal(cloud.sovereign.selected, 'held');
    assert.equal(cloud.steward.selected, privateRepo ? 'held' : 'public-hosted-ubuntu');
    const local = resolveExecutionRoute({ requestedMode: 'local', repositoryPrivate: privateRepo, privateStewardEnabled: true });
    assert.equal(local.steward.selected, privateRepo ? 'local-windows' : 'held');
    assert.equal(local.sovereign.selected, privateRepo ? 'local-windows' : 'held');
  }
  assert.equal(resolveExecutionRoute({ requestedMode: 'hold', repositoryPrivate: false }).steward.selected, 'held');
  assert.equal(resolveExecutionRoute({ requestedMode: 'hold', repositoryPrivate: true }).sovereign.selected, 'held');
});

test('Steward uses a single owner-selectable job-level routing guard with no private hosted fallback', () => {
  const workflow = read('.github/workflows/steward-two-hour-learning.yml');
  const mirror = read('state/release-baseline/.github/workflows/steward-two-hour-learning.yml');
  assert.equal(workflow, mirror);
  assert.match(workflow, /MAHORAGA_EXECUTION_ROUTE/);
  assert.match(workflow, /github\.event\.repository\.private == false/);
  assert.match(workflow, /github\.event\.repository\.private == true/);
  assert.match(workflow, /MAHORAGA_PRIVATE_STEWARD_LOCAL_ENABLED == 'true'/);
  assert.match(workflow, /vars\.MAHORAGA_EXECUTION_ROUTE == 'auto'/);
  assert.match(workflow, /vars\.MAHORAGA_EXECUTION_ROUTE == 'cloud'/);
  assert.match(workflow, /vars\.MAHORAGA_EXECUTION_ROUTE == 'local'/);
  assert.match(workflow, /fromJSON\(github\.event\.repository\.private/);
  assert.match(workflow, /\["self-hosted","windows","x64","mahoraga","zero-credit"\]/);
  assert.match(workflow, /'"ubuntu-latest"'/);
  assert.doesNotMatch(workflow, /runs-on:\s*ubuntu-latest\b/);
  assert.match(workflow, /github\.actor == 'michaeljwilliams0123'/);
});

test('both sovereign jobs honor owner routing modes before runner allocation', () => {
  const workflow = read('.github/workflows/sovereign-eight-hour-cycle.yml');
  assert.match(workflow, /MAHORAGA_ZERO_CREDIT_MODEL_URL:\s*["']{2}/);
  assert.equal((workflow.match(/runs-on:\s*\[self-hosted,\s*windows,\s*x64,\s*mahoraga,\s*zero-credit\]/gi) ?? []).length, 2);
  assert.equal((workflow.match(/vars\.MAHORAGA_EXECUTION_ROUTE == 'local'/g) ?? []).length, 2);
  assert.equal((workflow.match(/vars\.MAHORAGA_EXECUTION_ROUTE == 'auto'/g) ?? []).length, 2);
  assert.equal((workflow.match(/vars\.MAHORAGA_EXECUTION_ROUTE == ''/g) ?? []).length, 2);
  assert.doesNotMatch(workflow, /sd009wc7|runs-on:\s*(?:ubuntu|windows)-latest/i);
});

test('switch requires an explicit owner apply action, never secrets or workflow-token privilege escalation', () => {
  const cli = read('scripts/execution-route-switch.mjs');
  assert.match(cli, /--apply/);
  assert.match(cli, /gh.*variable set|variable", "set"/);
  assert.match(cli, /MAHORAGA_EXECUTION_ROUTE/);
  assert.match(cli, /permissions\.admin/);
  assert.match(cli, /resolveExecutionRoute/);
  assert.doesNotMatch(cli, /OPENAI_API_KEY|CODEX_API_KEY|--replace|gh secret set|gh repo edit/);
});
