import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadManifest, validateManifest } from "../src/config.mjs";
import { buildCodexBuilderEnvelope, executeCodexBuilderCapability, findInstalledCodexCli } from "../src/codex-builder-worker.mjs";

async function builderWorker() { return (await loadManifest()).workers.find((worker) => worker.id === "primary-codex-builder"); }

test("Codex Builder is separate, task-scoped, account-authenticated, and enabled", async () => {
  const worker = await builderWorker();
  const envelope = buildCodexBuilderEnvelope({ worker, task: { id: "mhg-builder", correlationId: "pcx-builder", requestedOutcome: "Inspect and repair the provider adapter." }, session: { authoritySessionId: "primary-session", executionSessionId: "cdb-session" } });
  assert.equal(worker.enabled, true);
  assert.equal(envelope.executionMode, "task-scoped");
  assert.equal(envelope.interactiveAuthority, false);
  assert.equal(envelope.directExecutionEnabled, true);
  assert.equal(envelope.apiKeyRequired, false);
  assert.match(envelope.prompt, /Follow AGENTS\.md/);
});

test("Codex Builder health accepts the callable user-level CLI and saved account auth", async () => {
  const worker = await builderWorker();
  const result = await executeCodexBuilderCapability("codex.health", {}, worker, { run: async () => ({ exitCode: 0, errorCode: null, stdout: "codex-cli 0.145.0", stderr: "", authenticationConfigured: true }) });
  assert.equal(result.verified, true);
  assert.equal(result.providerHealth.invocation, "non-interactive-cli");
  assert.equal(result.providerHealth.authentication, "verified");
  assert.equal(result.providerHealth.version, "0.145.0");
});

test("Codex Builder execution stores bounded metadata but not the final model response", async () => {
  const worker = await builderWorker();
  const task = { id: "mhg-builder-run", correlationId: "pcx-builder-run", requestedOutcome: "Run the narrow repair." };
  const result = await executeCodexBuilderCapability("codex.execute", task, worker, {
    runTask: async () => ({ exitCode: 0, completed: true, threadId: "01a0375c-6146-7dc0-bc8d-c0cb8c44228b", outputSha256: "a".repeat(64), changedPaths: ["src/provider.mjs"], usage: { input_tokens: 10, cached_input_tokens: 5, output_tokens: 3, reasoning_output_tokens: 1 }, finalText: "private response" }),
  });
  assert.equal(result.verified, true);
  assert.equal(result.providerReceipt.finalResponseStored, false);
  assert.deepEqual(result.providerReceipt.changedPaths, ["src/provider.mjs"]);
  assert.equal(JSON.stringify(result).includes("private response"), false);
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
