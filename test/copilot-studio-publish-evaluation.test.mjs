import test from "node:test";
import assert from "node:assert/strict";
import { executeCopilotStudioPacSync } from "../src/copilot-studio-pac-sync.mjs";

const ENVIRONMENT_ID = "120aeae9-286f-438a-bbf3-de3ab96fcf5d";
const request = Object.freeze({
  alias: "general-mahoraga",
  reasonCodes: Object.freeze(["connected-agent-missing"]),
  surfaces: Object.freeze(["instructions"]),
  publish: true,
  idempotencyKey: "cfg-evaluate-1",
});

function dependencies(overrides = {}) {
  const calls = [];
  const pacArgs = [];
  return {
    calls,
    pacArgs,
    value: {
      platform: "win32",
      workspaceRoot: "C:\\Mahoraga\\Studio",
      resolveAgent: async (alias) => ({ alias, workspaceName: alias, botSchemaName: "mhg_general", environmentId: ENVIRONMENT_ID }),
      ensureWorkspace: async ({ workspacePath }) => ({ verified: true, workspacePath }),
      runPac: async (_command, args) => { calls.push(args[1]); pacArgs.push([...args]); return { stdout: "ok", stderr: "" }; },
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

test("verified passing evaluation publishes to the same trusted environment after provider verification", async () => {
  const fixture = dependencies({ evaluateAgent: async () => ({ verified: true, state: "passing", score: 0.93 }) });
  const result = await executeCopilotStudioPacSync(request, fixture.value);
  assert.deepEqual(fixture.calls, ["pull", "push", "pull", "publish"]);
  assert.deepEqual(fixture.pacArgs.at(-1), ["copilot", "publish", "--bot", "mhg_general", "--environment", ENVIRONMENT_ID]);
  assert.deepEqual(result.phases, ["pull", "validate", "push", "verify", "evaluate", "publish"]);
  assert.deepEqual(result.evaluation, { state: "passing", scoreBasisPoints: 9300 });
});

test("publish fails closed before PAC execution when the trusted environment binding is missing", async () => {
  const fixture = dependencies({
    resolveAgent: async (alias) => ({ alias, workspaceName: alias, botSchemaName: "mhg_general", environmentId: "" }),
    evaluateAgent: async () => ({ verified: true, state: "passing", score: 0.93 }),
  });
  await assert.rejects(() => executeCopilotStudioPacSync(request, fixture.value), /studio-pac-agent-binding-missing/);
  assert.deepEqual(fixture.calls, []);
});
