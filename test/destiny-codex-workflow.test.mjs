import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";

const WORKFLOW = path.join(ROOT, ".github", "workflows", "destiny-codex-relay.yml");

async function source() {
  return (await readFile(WORKFLOW, "utf8")).replaceAll("\r\n", "\n");
}

test("Destiny relay reacts to live pull-request changes and remains read-only", async () => {
  const workflow = await source();
  assert.match(workflow, /pull_request:\s*\n\s+types: \[opened, reopened, synchronize, ready_for_review, edited\]/);
  assert.match(workflow, /if: startsWith\(github\.event\.pull_request\.title, '\[DESTINY-CODEX\]'\)/);
  const permissions = workflow.match(/\npermissions:\n([\s\S]*?)\nconcurrency:/)?.[1];
  assert.ok(permissions, "permissions block missing");
  assert.deepEqual(permissions.trim().split(/\n/).map((line) => line.trim()).filter(Boolean), ["contents: read", "pull-requests: read"]);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(workflow, /permissions:[\s\S]*?contents: write/);
});

test("Destiny relay executes only the trusted base validator against the isolated candidate checkout", async () => {
  const workflow = await source();
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}[\s\S]*?path: trusted/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}[\s\S]*?path: candidate/);
  assert.match(workflow, /run: node trusted\/scripts\/destiny-codex-dispatch\.mjs validate-pr --root candidate/);
  assert.doesNotMatch(workflow, /run: node candidate\/scripts\/destiny-codex-dispatch/);
  assert.match(workflow, /actions\/checkout@[a-f0-9]{40} # v7/);
  assert.match(workflow, /actions\/setup-node@[a-f0-9]{40} # v7/);
});

test("Destiny relay distinguishes deterministic validation from the event receipt", async () => {
  const workflow = await source();
  assert.match(workflow, /A separate `\[DESTINY-CODEX:ACK\]` comment proves the event-triggered Codex run received it/);
});
