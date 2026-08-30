import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { executeCodexBuilderCapability } from "../src/codex-builder-worker.mjs";
import { loadManifest } from "../src/config.mjs";

test("Codex Builder invokes the provider only inside a candidate cell and returns metadata-only evidence", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-codex-cell-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, "src"), { recursive: true });
  writeFileSync(path.join(root, ".gitignore"), "state/\n", "utf8");
  writeFileSync(path.join(root, "src", "provider.mjs"), "export const value = 1;\n", "utf8");
  git(root, "init", "--initial-branch=main");
  git(root, "config", "user.email", "mahoraga@example.com");
  git(root, "config", "user.name", "Mahoraga Test");
  git(root, "add", ".");
  git(root, "commit", "-m", "base");
  const baseCommit = git(root, "rev-parse", "HEAD").trim();
  const leaseId = "int-00000000-0000-4000-8000-000000000002";
  const worker = (await loadManifest()).workers.find((item) => item.id === "primary-codex-builder");
  const task = {
    id: "mhg-builder-runtime",
    correlationId: "pcx-builder-runtime",
    requestedOutcome: "Update the bounded provider module.",
    baseCommit,
    allowedPaths: ["src/provider.mjs"],
    integrationLeaseId: leaseId,
    integrationLease: { leaseId, paths: ["src/provider.mjs"], expiresAt: "2099-08-25T12:00:00.000Z" },
    executionSessionId: "cdb-builder-runtime",
  };
  let observedWorkingDirectory = null;
  const result = await executeCodexBuilderCapability("codex.execute", task, worker, {
    repositoryRoot: root,
    runTask: async (envelope) => {
      observedWorkingDirectory = envelope.workingDirectory;
      assert.notEqual(envelope.workingDirectory, root);
      assert.match(envelope.prompt, /Do not merge, push, deploy/);
      writeFileSync(path.join(envelope.workingDirectory, "src", "provider.mjs"), "export const value = 2;\n", "utf8");
      git(envelope.workingDirectory, "add", "src/provider.mjs");
      git(envelope.workingDirectory, "commit", "-m", "bounded candidate");
      return {
        exitCode: 0,
        completed: true,
        threadId: "01a0375c-6146-7dc0-bc8d-c0cb8c44228b",
        outputSha256: "a".repeat(64),
        usage: { input_tokens: 10, cached_input_tokens: 5, output_tokens: 3, reasoning_output_tokens: 1 },
        finalText: "private response",
      };
    },
  });
  assert.equal(result.verified, true);
  assert.ok(observedWorkingDirectory.includes(path.join("state", "execution-cells", "codex")));
  assert.deepEqual(result.providerReceipt.changedPaths, ["src/provider.mjs"]);
  assert.equal(result.providerReceipt.validationState, "passed");
  assert.equal(result.providerReceipt.quarantineState, "clear");
  assert.equal(result.providerReceipt.finalResponseStored, false);
  assert.equal(JSON.stringify(result).includes("private response"), false);
  assert.equal(JSON.stringify(result).includes(observedWorkingDirectory), false);
});

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
}
