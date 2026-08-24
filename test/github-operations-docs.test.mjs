import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

async function source(relativePath) {
  return (await readFile(path.join(ROOT, relativePath), "utf8")).replaceAll("\r\n", "\n");
}

test("GitHub operations preserve the user-directed public visibility boundary", async () => {
  const operations = await source("docs/GITHUB-OPERATIONS.md");
  assert.match(operations, /intentionally public under the user's current directive/);
  assert.match(operations, /no script, issue, workflow, or controller may change it/);
  assert.doesNotMatch(operations, /repository remains private as required/i);

  const connector = await source("scripts/connect-chatgpt-codex.ps1");
  assert.doesNotMatch(connector, /private repository access failed/i);
});

test("coordination docs preserve equal controller authority", async () => {
  const coordination = await source("docs/GITHUB-CODEX-COORDINATION.md");
  assert.match(coordination, /not an ownership hierarchy/);
  assert.match(coordination, /Any authorized\s+controller may review and integrate verified work/);
  assert.doesNotMatch(coordination, /Secondary Codex never merges/);
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

test("security baseline preserves the control path while recording live hardening", async () => {
  const baseline = await source("docs/GITHUB-SECURITY-BASELINE.md");
  assert.match(baseline, /does not change repository visibility/);
  assert.match(baseline, /secret scanning, push protection, Dependabot alerts/);
  assert.match(baseline, /Do not require pull requests\s+until the Chromebook control workflow is migrated/);
  assert.match(baseline, /Do not enable a setting\s+that silently disables this outbound control path/);
});
