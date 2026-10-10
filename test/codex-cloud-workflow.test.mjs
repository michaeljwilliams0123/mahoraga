import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

const file = path.join(ROOT, ".github", "workflows", "codex-cloud-dispatch.yml");

async function workflow() {
  return (await readFile(file, "utf8")).replaceAll("\r\n", "\n");
}

test("Codex cloud dispatch is owner-manual only and stages one bounded draft PR", async () => {
  const source = await workflow();
  assert.doesNotMatch(source, /^\s+push:/m);
  assert.doesNotMatch(source, /^\s+schedule:/m);
  assert.match(source, /workflow_dispatch:/);
  assert.match(source, /owner_authorization:/);
  assert.match(source, /AUTHORIZE_ONE_STAGING_RUN/);
  assert.match(source, /github\.actor == 'michaeljwilliams0123'/);
  assert.match(source, /const selected = bundle\.tasks\.filter/);
  assert.match(source, /selected\.length !== 1/);
  assert.match(source, /draft-cap-reached-reuse-existing-pr/);
  assert.match(source, /objective-already-open-reuse-existing-pr/);
  assert.match(source, /actions\/checkout@[a-f0-9]{40} # v7/);
  assert.match(source, /actions\/github-script@[a-f0-9]{40} # v9/);

  const block = source.match(/\npermissions:\n([\s\S]*?)\nconcurrency:/)?.[1];
  assert.ok(block, "permissions block missing");
  const permissions = block.trim().split(/\n/).map((line) => line.trim()).filter(Boolean).sort();
  assert.deepEqual(permissions, ["contents: write", "issues: write", "pull-requests: write"]);
  assert.match(source, /const branch = `codex-dispatch\/\$\{task\.taskId\}`/);
  assert.match(source, /const activationPath = `coordination\/codex-activations\/\$\{task\.taskId\}\.json`/);
  assert.match(source, /draft: true/);
  assert.match(source, /No model has been invoked/);
  assert.match(source, /labelNames\.some\(\(name\) => name === "codex:done" \|\| name === "codex:blocked"\)/);
  assert.match(source, /pulls\.data\.find\(\(candidate\) => candidate\.state === "open"\)/);
  assert.match(source, /pulls\.data\.find\(\(candidate\) => Boolean\(candidate\.merged_at\)\)/);
  assert.doesNotMatch(source, /if \(!labelNames\.includes\("codex:draft-required"\)\)/);
});

test("Codex cloud dispatch uses the validated bundle and stores no OpenAI credential", async () => {
  const source = await workflow();
  assert.match(source, /scripts\/codex-cloud-task\.mjs/);
  assert.match(source, /"dispatch-bundle"/);
  assert.match(source, /body: task\.issue\.body\.replace\(\/\^@codex\\s\*\/i, ""\)/);
  assert.match(source, /codex:pr-comment-required/);
  assert.doesNotMatch(source, /body:\s*[`'"]@codex\b/i);
  assert.doesNotMatch(source, /OPENAI_API_KEY/);
  assert.doesNotMatch(source, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(source, /api[_-]?key\s*:/i);
});
