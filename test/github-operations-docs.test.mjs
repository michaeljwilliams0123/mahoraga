import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

async function source(relativePath) {
  return (await readFile(path.join(ROOT, relativePath), "utf8")).replaceAll("\r\n", "\n");
}

test("GitHub operations preserve the user-directed private visibility boundary", async () => {
  const operations = await source("docs/GITHUB-OPERATIONS.md");
  assert.match(operations, /intentionally private under the user's current directive/);
  assert.match(operations, /no script, issue, workflow, or controller may change it/);
  assert.doesNotMatch(operations, /intentionally public under the user's current directive/);

  const connector = await source("scripts/connect-chatgpt-codex.ps1");
  assert.doesNotMatch(connector, /private repository access failed/i);
});

test("coordination docs define equal primaries and guarded integration", async () => {
  const coordination = await source("docs/GITHUB-CODEX-COORDINATION.md");
  assert.match(coordination, /Local and cloud Primary Codex\s+are equal controllers/);
  assert.match(coordination, /single, time-bounded integration lease/);
  assert.match(coordination, /verified local automatic core-update activation with rollback/);
  assert.match(coordination, /Secondary Codex implements scoped repository work only/);
  assert.match(coordination, /it never pushes or merges `main`/);
  assert.match(coordination, /paths may overlap/);
  assert.match(coordination, /Destiny Event Dispatch Lane/);
  assert.match(coordination, /Repository validation does not prove external delivery or execution/);
  assert.match(coordination, /Owner-authored\s+comments are not sufficient execution identity evidence/);
  assert.match(coordination, /does not transfer authentication, subscription credits, conversations, or\s+personal context/);
});

test("pull requests require deterministic evidence and public-repository privacy checks", async () => {
  const template = await source(".github/pull_request_template.md");
  assert.match(template, /node src\/cli\.mjs validate/);
  assert.match(template, /node scripts\/coordination\.mjs validate/);
  assert.match(template, /npm run github:audit/);
  assert.match(template, /node --test --test-isolation=none/);
  assert.match(template, /No credentials, tokens, prompts, model responses, browser data/);
  assert.match(template, /does not change repository visibility/);
});

test("security baseline attests live exact-head main protection", async () => {
  const baseline = await source("docs/GITHUB-SECURITY-BASELINE.md");
  assert.match(baseline, /does not change repository visibility/);
  assert.match(baseline, /Secret scanning, push protection, Dependabot alerts/i);
  assert.match(baseline, /22327855/);
  assert.match(baseline, /blocks deletion and force-push/);
  assert.match(baseline, /github-live-protection\.mjs/);
  assert.match(baseline, /incumbent-trust-epoch\.json/);
  assert.doesNotMatch(baseline, /does not require pull requests or status checks/);
  assert.doesNotMatch(baseline, /Chromebook control workflow still fast-forwards/);
});
