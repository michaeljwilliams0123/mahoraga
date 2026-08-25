import assert from "node:assert/strict";
import test from "node:test";
import {
  createCodexCloudDispatchBundle,
  createCodexCloudReturn,
  createCodexCloudTask,
  renderCodexCloudIssue,
  validateCodexCloudReturn,
  validateCodexCloudTask,
} from "../src/codex-cloud-contract.mjs";

const task = (overrides = {}) => createCodexCloudTask({
  idempotencyKey: "mahoraga-private-bridge-v1",
  repository: "michaeljwilliams0123/mahoraga",
  baseCommit: "91b48883f97e3551553b3545beed9cc83dec26dc",
  title: "Implement the bounded bridge",
  task: "Implement the repository-only bridge and return a pull request.",
  allowedPaths: [".github", "docs", "src", "test"],
  verification: ["npm run verify"],
  maximumAttempts: 2,
  integrationMode: "merge-after-verify",
  ...overrides,
}, { taskId: "ccx-12345678-1234-1234-1234-123456789abc", now: "2026-08-23T00:00:00.000Z" });

test("Codex cloud tasks are strict, repository-bound, and private", () => {
  const record = task();
  assert.equal(record.privacy.chatAccess, false);
  assert.equal(record.privacy.credentialsIncluded, false);
  assert.equal(record.integrationMode, "merge-after-verify");
  assert.throws(() => validateCodexCloudTask({ ...record, githubToken: "secret" }), /field is not allowed/);
  assert.throws(() => task({ repository: "https://github.com/example/repo" }), /repository is invalid/);
  assert.throws(() => task({ repository: "../repo" }), /repository is invalid/);
  assert.throws(() => task({ allowedPaths: [".git/config"] }), /allowed paths are invalid/);
  assert.throws(() => task({ integrationMode: "direct-unverified" }), /integration mode is invalid/);
});

test("issue rendering is deterministic and carries an idempotency marker", () => {
  const record = task();
  const reordered = Object.fromEntries(Object.entries(record).reverse());
  const first = renderCodexCloudIssue(record);
  const second = renderCodexCloudIssue(reordered);
  assert.deepEqual(first, second);
  assert.match(first.body, /^@codex/m);
  assert.match(first.body, /idempotency-key=mahoraga-private-bridge-v1/);
  assert.match(first.body, /Do not access, request, or export ChatGPT conversations/);
  assert.match(first.body, /Primary may merge only after every declared verification command passes/);
  assert.deepEqual(first.labels, ["codex:queued", "privacy:repo-only"]);
});

test("dispatch bundles are deterministic and reject duplicate logical tasks", () => {
  const first = task();
  const second = task({ idempotencyKey: "mahoraga-private-bridge-v2", title: "Implement the next bounded bridge" });
  const secondWithId = { ...second, taskId: "ccx-87654321-4321-4321-4321-cba987654321" };
  const bundle = createCodexCloudDispatchBundle([first, secondWithId]);
  assert.equal(bundle.schemaVersion, 1);
  assert.equal(bundle.tasks.length, 2);
  assert.equal(bundle.tasks[0].issue.title, "[CODEX] Implement the bounded bridge");
  assert.throws(() => createCodexCloudDispatchBundle([first, first]), /Duplicate Codex cloud task ID/);
  assert.throws(() => createCodexCloudDispatchBundle([first, { ...first, taskId: secondWithId.taskId }]), /Duplicate Codex cloud idempotency key/);
});

test("known credential material is rejected before rendering", () => {
  assert.throws(() => task({ task: "Use github_pat_1234567890abcdef1234 to access GitHub." }), /cannot contain credentials/);
  assert.throws(() => task({ idempotencyKey: "github_pat_1234567890abcdef1234" }), /cannot contain credentials/);
  assert.throws(() => task({ verification: ["curl -H 'Authorization: Bearer eyJ1234567890abcdef'"] }), /cannot contain credentials/);
});

test("returns bind issue and pull request evidence to task paths", () => {
  const record = task();
  const result = createCodexCloudReturn(record, {
    issueNumber: 1,
    pullRequestNumber: 2,
    headCommit: "1234567890abcdef1234567890abcdef12345678",
    changedFiles: ["src/codex-cloud-contract.mjs", "test/codex-cloud-contract.test.mjs"],
    verification: ["npm run verify: 52 passed"],
    summary: "Implemented and verified the bounded bridge.",
  }, { now: "2026-08-23T01:00:00.000Z" });
  assert.equal(validateCodexCloudReturn(result, record).pullRequestNumber, 2);
  assert.throws(() => validateCodexCloudReturn({ ...result, changedFiles: ["state/private.token"] }, record), /outside task scope/);
});

test("blocked returns require no fabricated pull request or head commit", () => {
  const result = createCodexCloudReturn(task(), {
    state: "blocked",
    issueNumber: 1,
    summary: "The repository environment is not connected to Codex cloud.",
    verification: ["GitHub issue remained unacknowledged"],
  });
  assert.equal(result.pullRequestNumber, null);
  assert.equal(result.headCommit, null);
});
