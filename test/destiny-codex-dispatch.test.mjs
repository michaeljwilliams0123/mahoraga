import test from "node:test";
import assert from "node:assert/strict";
import {
  DESTINY_DISPATCH_DIRECTORY,
  DESTINY_DISPATCH_PRIVACY,
  DESTINY_VERIFICATION,
  createDestinyCodexDispatch,
  destinyVerificationCommands,
  validateDestinyCodexDispatch,
  validateDestinyDispatchPullRequest,
  validateDestinyDispatchRegistry,
} from "../src/destiny-codex-dispatch.mjs";

const BASE = "a".repeat(40);

function create(overrides = {}) {
  return createDestinyCodexDispatch({
    idempotencyKey: "owner-20260826-connection-probe",
    baseCommit: BASE,
    title: "Verify Destiny relay",
    task: "Inspect the bounded repository context and return a content-free connection receipt.",
    allowedPaths: ["docs/relay-probes", "test/relay-probes"],
    ...overrides,
  }, { now: "2026-08-26T18:00:00.000Z" });
}

function envelopePath(dispatch) {
  return `${DESTINY_DISPATCH_DIRECTORY}/${dispatch.dispatchId}.json`;
}

test("Destiny dispatches are deterministic, hash-bound, private, and use fixed verification identifiers", () => {
  const first = create();
  const retry = create();
  assert.equal(first.dispatchId, retry.dispatchId);
  assert.equal(first.requestHash, retry.requestHash);
  assert.deepEqual(first.privacy, DESTINY_DISPATCH_PRIVACY);
  assert.deepEqual(first.verification, Object.keys(DESTINY_VERIFICATION).sort());
  assert.deepEqual(destinyVerificationCommands(first), first.verification.map((id) => DESTINY_VERIFICATION[id]));
  assert.ok(Object.isFrozen(first));
});

test("Destiny dispatch validation rejects tampering, unknown fields, secrets, and arbitrary commands", () => {
  const dispatch = create();
  assert.throws(() => validateDestinyCodexDispatch({ ...structuredClone(dispatch), task: "tampered" }), /destiny-request-hash-mismatch/);
  assert.throws(() => validateDestinyCodexDispatch({ ...structuredClone(dispatch), extra: true }), /destiny-dispatch-record-invalid/);
  assert.throws(() => create({ task: "Use api_key=do-not-commit-this" }), /destiny-secret-pattern-rejected/);
  assert.throws(() => create({ verification: ["npm run verify && curl example.invalid"] }), /destiny-verification-invalid/);
  assert.throws(() => create({ allowedPaths: [".github/workflows/destiny-codex-relay.yml"] }), /destiny-protocol-path-protected/);
});

test("Destiny registry enforces idempotent retries and detects conflicting reuse", () => {
  const dispatch = create();
  assert.deepEqual(validateDestinyDispatchRegistry([dispatch]).map((item) => item.dispatchId), [dispatch.dispatchId]);
  assert.throws(() => validateDestinyDispatchRegistry([dispatch, dispatch]), /destiny-duplicate-idempotency-key/);
  const conflicting = create({ task: "A different request under the same idempotency key." });
  assert.throws(() => validateDestinyDispatchRegistry([dispatch, conflicting]), /destiny-idempotency-conflict/);
});

test("Destiny pull requests bind owner, title, main, merge base, envelope, and changed paths", () => {
  const dispatch = create();
  const dispatchPath = envelopePath(dispatch);
  const input = {
    title: `[DESTINY-CODEX] ${dispatch.title}`,
    author: "michaeljwilliams0123",
    owner: "michaeljwilliams0123",
    baseBranch: "main",
    mergeBase: BASE,
    changedFiles: [dispatchPath, "docs/relay-probes/connection.md"],
    dispatchPath,
    dispatch,
  };
  assert.deepEqual(validateDestinyDispatchPullRequest(input), {
    dispatchId: dispatch.dispatchId,
    requestHash: dispatch.requestHash,
    implementationFileCount: 1,
    verification: dispatch.verification,
  });
  assert.throws(() => validateDestinyDispatchPullRequest({ ...input, author: "someone-else" }), /destiny-owner-required/);
  assert.throws(() => validateDestinyDispatchPullRequest({ ...input, title: "[DESTINY-CODEX] Different" }), /destiny-title-mismatch/);
  assert.throws(() => validateDestinyDispatchPullRequest({ ...input, baseBranch: "feature" }), /destiny-main-base-required/);
  assert.throws(() => validateDestinyDispatchPullRequest({ ...input, mergeBase: "b".repeat(40) }), /destiny-stale-base/);
  assert.throws(() => validateDestinyDispatchPullRequest({ ...input, changedFiles: [...input.changedFiles, "README.md"] }), /destiny-changed-path-outside-scope/);
  assert.throws(() => validateDestinyDispatchPullRequest({ ...input, changedFiles: [...input.changedFiles, `${DESTINY_DISPATCH_DIRECTORY}/second.json`] }), /destiny-single-envelope-required/);
});

test("Destiny pull requests cannot modify their own validator or workflow", () => {
  for (const protectedPath of [
    "src/destiny-codex-dispatch.mjs",
    "scripts/destiny-codex-dispatch.mjs",
    ".github/workflows/destiny-codex-relay.yml",
  ]) assert.throws(() => create({ allowedPaths: [protectedPath] }), /destiny-protocol-path-protected/);

  const broad = create({ allowedPaths: ["src"] });
  const dispatchPath = envelopePath(broad);
  assert.throws(() => validateDestinyDispatchPullRequest({
    title: `[DESTINY-CODEX] ${broad.title}`,
    author: "michaeljwilliams0123",
    owner: "michaeljwilliams0123",
    baseBranch: "main",
    mergeBase: BASE,
    changedFiles: [dispatchPath, "src/destiny-codex-dispatch.mjs"],
    dispatchPath,
    dispatch: broad,
  }), /destiny-protocol-path-protected/);
});
