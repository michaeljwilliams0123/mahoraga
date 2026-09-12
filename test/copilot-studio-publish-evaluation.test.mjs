import test from "node:test";
import assert from "node:assert/strict";
import { executeCopilotStudioPacSync } from "../src/copilot-studio-pac-sync.mjs";

const request = Object.freeze({
  alias: "general-mahoraga",
  reasonCodes: Object.freeze(["connected-agent-missing"]),
  surfaces: Object.freeze(["instructions"]),
  publish: true,
  idempotencyKey: "cfg-evaluate-1",
});

function dependencies(overrides = {}) {
  const calls = [];
  return {
    calls,
    value: {
      platform: "win32",
      workspaceRoot: "C:\\Mahoraga\\Studio",
      resolveAgent: async (alias) => ({ alias, workspaceName: alias, botSchemaName: "mhg_general" }),
      ensureWorkspace: async ({ workspacePath }) => ({ verified: true, workspacePath }),
      runPac: async (_command, args) => { calls.push(args[1]); return { stdout: "ok", stderr: "" }; },
      snapshotWorkspace: async () => "a".repeat(64),
      applyMutation: async () => ({ verified: true, changedFiles: ["agent.mcs.yaml"] }),
      validateWorkspace: async () => ({ verified: true }),
      ...overrides,
    },
  };
}

test("publish is blocked when evaluation evidence is unavailable", async () => {
  const fixture = dependencies();
  await assert.rejects(() => executeCopilotStudioPacSync(request, fixture.value), /studio-pac-evaluation-required/);
  assert.deepEqual(fixture.calls, ["pull", "push", "pull"]);
});

test("failed evaluation blocks publish after verified push", async () => {
  const fixture = dependencies({ evaluateAgent: async () => ({ verified: false, state: "failing", score: 0.4 }) });
  await assert.rejects(() => executeCopilotStudioPacSync(request, fixture.value), /studio-pac-evaluation-failed/);
  assert.deepEqual(fixture.calls, ["pull", "push", "pull"]);
});

test("verified passing evaluation admits explicit publish after provider verification", async () => {
  const fixture = dependencies({ evaluateAgent: async () => ({ verified: true, state: "passing", score: 0.93 }) });
  const result = await executeCopilotStudioPacSync(request, fixture.value);
  assert.deepEqual(fixture.calls, ["pull", "push", "pull", "publish"]);
  assert.deepEqual(result.phases, ["pull", "validate", "push", "verify", "evaluate", "publish"]);
  assert.deepEqual(result.evaluation, { state: "passing", scoreBasisPoints: 9300 });
});
