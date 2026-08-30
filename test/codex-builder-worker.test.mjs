import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadManifest, validateManifest } from "../src/config.mjs";
import { buildCodexBuilderEnvelope, executeCodexBuilderCapability, findInstalledCodexCli } from "../src/codex-builder-worker.mjs";

async function builderWorker() { return (await loadManifest()).workers.find((worker) => worker.id === "primary-codex-builder"); }

test("Codex Builder is separate, task-scoped, account-authenticated, and enabled", async () => {
  const worker = await builderWorker();
  const task = { id: "mhg-builder", correlationId: "pcx-builder", requestedOutcome: "Inspect and repair the provider adapter." };
  const envelope = buildCodexBuilderEnvelope({ worker, task, session: { authoritySessionId: "primary-session", executionSessionId: "cdb-session" }, cell: { taskId: task.id, path: "C:\\candidate", baseCommit: "a".repeat(40), allowedPaths: ["src"] } });
  assert.equal(worker.enabled, true);
  assert.equal(envelope.executionMode, "candidate-worktree");
  assert.equal(envelope.interactiveAuthority, false);
  assert.equal(envelope.directExecutionEnabled, true);
  assert.equal(envelope.apiKeyRequired, false);
  assert.match(envelope.prompt, /Follow AGENTS\.md/);
});

test("Codex Builder health accepts the callable user-level CLI and saved account auth", async () => {
  const worker = await builderWorker();
  const result = await executeCodexBuilderCapability("codex.health", {}, worker, { run: async () => ({ exitCode: 0, errorCode: null, stdout: "codex-cli 0.145.0", stderr: "", authenticationConfigured: true, executionCellCanary: "verified" }) });
  assert.equal(result.verified, true);
  assert.equal(result.providerHealth.invocation, "non-interactive-cli");
  assert.equal(result.providerHealth.authentication, "verified");
  assert.equal(result.providerHealth.version, "0.145.0");
});

test("Codex Builder refuses execution before provider invocation when the execution-cell contract is missing", async () => {
  const worker = await builderWorker();
  const task = { id: "mhg-builder-run", correlationId: "pcx-builder-run", requestedOutcome: "Run the narrow repair." };
  let invoked = false;
  const result = await executeCodexBuilderCapability("codex.execute", task, worker, {
    runTask: async () => { invoked = true; return { exitCode: 0, completed: true }; },
  });
  assert.equal(result.verified, false);
  assert.equal(invoked, false);
  assert.equal(result.providerReceipt.finalResponseStored, false);
});

test("Codex CLI discovery is fixed to the user-level package or sandbox binary", async () => {
  const seen = [];
  const resolved = await findInstalledCodexCli({
    env: { LOCALAPPDATA: "C:\\Users\\owner\\AppData\\Local", USERPROFILE: "C:\\Users\\owner" },
    list: async () => [{ name: "@openai+codex@0.145.0-win32-x64", isDirectory: () => true }],
    canAccess: async (candidate) => { seen.push(candidate); },
  });
  assert.match(resolved, /Programs[\\/]CodexCLI/);
  assert.equal(path.basename(resolved), "codex.exe");
  assert.equal(seen.length, 1);
});

test("manifest rejects disabling direct task-scoped Codex execution or widening the sandbox", async () => {
  const manifest = structuredClone(await loadManifest());
  const adapter = manifest.workers.find((worker) => worker.id === "primary-codex-builder").adapter;
  adapter.directExecutionEnabled = false;
  assert.throws(() => validateManifest(manifest), /Codex Builder adapter boundary/);
  adapter.directExecutionEnabled = true;
  adapter.sandbox = "danger-full-access";
  assert.throws(() => validateManifest(manifest), /Codex Builder adapter boundary/);
});
