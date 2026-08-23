import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest, validateManifest } from "../src/config.mjs";
import { ROOT } from "../src/config.mjs";
import { buildCopilotInvocation, executeCopilotCapability } from "../src/copilot-worker.mjs";

async function copilotWorker() {
  const manifest = await loadManifest();
  return manifest.workers.find((worker) => worker.id === "github-copilot");
}

function task() {
  return {
    id: "mhg-test-copilot",
    correlationId: "cor-test-copilot",
    taskArea: "provider-adapter",
    requestedOutcome: "Update a focused adapter test.",
  };
}

test("Copilot invocation fixes the repository boundary and disables remote control", async () => {
  const worker = await copilotWorker();
  const invocation = buildCopilotInvocation({ task: task(), worker });
  assert.equal(worker.enabled, false);
  assert.equal(invocation.command, "copilot");
  assert.equal(invocation.cwd, ROOT);
  assert.equal(invocation.args.includes("--no-remote"), true);
  assert.equal(invocation.args.includes("--no-remote-export"), true);
  assert.equal(invocation.args.includes("--disable-builtin-mcps"), true);
  assert.equal(invocation.args.includes("--disallow-temp-dir"), true);
  assert.equal(invocation.args.some((arg) => arg === "--allow-all" || arg === "--yolo"), false);
  assert.equal(invocation.args.some((arg) => arg.startsWith("--allow-tool=shell(git push)")), false);
  assert.match(invocation.args[invocation.args.indexOf("--prompt") + 1], /cor-test-copilot/);
});

test("Copilot health proves only local CLI availability without an AI request", async () => {
  const worker = await copilotWorker();
  const calls = [];
  const result = await executeCopilotCapability("copilot.health", task(), worker, {
    run: async (invocation) => {
      calls.push(invocation);
      return { exitCode: 0, timedOut: false, errorCode: null, stdout: "GitHub Copilot CLI 1.0.80.\n", stderr: "" };
    },
  });
  assert.deepEqual(calls[0].args, ["--version"]);
  assert.equal(result.verified, true);
  assert.match(result.summary, /authentication and quota remain unverified/);
  assert.equal(result.providerHealth.authentication, "unverified");
});

test("Copilot execution returns bounded deterministic receipt metadata without model output", async () => {
  const worker = await copilotWorker();
  const result = await executeCopilotCapability("copilot.execute", task(), worker, {
    run: async () => ({ exitCode: 0, timedOut: false, errorCode: null, stdout: "model response that must not be persisted", stderr: "warning" }),
  });
  assert.equal(result.verified, true);
  assert.match(result.summary, /stdout \d+ bytes/);
  assert.equal(result.summary.includes("model response"), false);
  assert.equal(result.providerReceipt.exitCode, 0);
  assert.equal(result.providerReceipt.stdoutSha256.length, 16);
});

test("manifest rejects a Copilot adapter that enables remote session control", async () => {
  const manifest = structuredClone(await loadManifest());
  manifest.workers.find((worker) => worker.id === "github-copilot").adapter.remoteSession = true;
  assert.throws(() => validateManifest(manifest), /Copilot adapter boundary/);
});
