import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFileSync(path.join(root, name), 'utf8');

test('sovereign candidate and producer use the same machine-neutral credit-free Windows labels', () => {
  const source = read('.github/workflows/sovereign-eight-hour-cycle.yml');
  const selected = /runs-on:\s*\[self-hosted,\s*windows,\s*x64,\s*mahoraga,\s*zero-credit\]/gi;
  assert.equal((source.match(selected) ?? []).length, 2, 'both local jobs must have identical capability labels');
  assert.doesNotMatch(source, /sd009wc7|runs-on:\s*(?:ubuntu|windows)-latest/i);
  assert.match(source, /MAHORAGA_ZERO_CREDIT_MODEL_URL:\s*["']{2}/);
  assert.match(source, /github.event_name == 'workflow_run'/);
  assert.match(source, /github.actor == 'michaeljwilliams0123'/);
});

test('portable enrollment stays private, owner-invoked, and requires official release integrity', () => {
  const win = read('scripts/portable-runner-enroll.ps1');
  const unix = read('scripts/portable-runner-enroll.sh');
  for (const script of [win, unix]) {
    assert.match(script, /2\.337\.0/);
    assert.match(script, /registration-token/);
    assert.match(script, /mahoraga,zero-credit/);
    assert.match(script, /private/);
    assert.doesNotMatch(script, /--replace|OPENAI_API_KEY|CODEX_API_KEY|RAILWAY_API_TOKEN/);
  }
  assert.match(win, /ValidateSet\('Inspect','Enroll'\)/);
  assert.match(win, /'1150692afa94e71f872017e254ea55b6eece1eece3fe7e3a6d4c93d0a1b85cfc'/);
  assert.match(win, /Get-FileHash -Algorithm SHA256/);
  assert.match(win, /Refusing self-hosted enrollment: repository must be private/);
  assert.match(win, /IsInRole/);
  assert.match(win, /--runasservice/);
  assert.match(unix, /case "\$mode" in inspect\|enroll/);
  assert.match(unix, /'70920811a4f8ad4328818682bca5c6469c1c942fab52448868071d0063816613'/);
  assert.match(unix, /sha256sum/);
  assert.match(unix, /shasum -a 256/);
  assert.match(unix, /sudo -n/);
  assert.match(unix, /Refusing self-hosted enrollment: repository must be private/);
});

test('Steward routes free hosted public jobs or owner-enabled private self-hosted jobs only', () => {
  const steward = read('.github/workflows/steward-two-hour-learning.yml');
  assert.match(steward, /github\.event\.repository\.private == false/);
  assert.match(steward, /github\.event\.repository\.private == true/);
  assert.match(steward, /MAHORAGA_PRIVATE_STEWARD_LOCAL_ENABLED == 'true'/);
  assert.match(steward, /fromJSON\(github\.event\.repository\.private/);
  assert.match(steward, /\["self-hosted","windows","x64","mahoraga","zero-credit"\]/);
  assert.match(steward, /'"ubuntu-latest"'/);
  assert.doesNotMatch(steward, /runs-on:\s*ubuntu-latest\b/);
  assert.equal(steward, read('state/release-baseline/.github/workflows/steward-two-hour-learning.yml'));
});
