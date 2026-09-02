import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

const file = path.join(ROOT, ".github", "workflows", "codex-cloud-dispatch.yml");

async function workflow() {
  return (await readFile(file, "utf8")).replaceAll("\r\n", "\n");
}

test("Codex cloud dispatch remains main-only and stages one bounded draft PR", async () => {
  const source = await workflow();
  assert.match(source, /push:\s*\n\s+branches:\s*\[main\]/);
  assert.match(source, /coordination\/cloud-tasks\/\*\.json/);
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
