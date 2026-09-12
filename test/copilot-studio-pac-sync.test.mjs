import test from "node:test";
import assert from "node:assert/strict";
import { executeCopilotStudioPacSync } from "../src/copilot-studio-pac-sync.mjs";

const request = Object.freeze({
  alias: "enterprise-core",
  reasonCodes: Object.freeze(["tool-missing"]),
  surfaces: Object.freeze(["tools"]),
  publish: false,
  idempotencyKey: "cfg-pac-1",
});

function fixture() {
  const calls = [];
  return {
    calls,
    dependencies: {
      platform: "win32",
      workspaceRoot: "C:\\Mahoraga\\Studio",
      resolveAgent: async (alias) => ({ alias, workspaceName: "enterprise-core", botSchemaName: "mhg_enterprise_core" }),
      ensureWorkspace: async ({ workspacePath }) => { calls.push(["workspace", workspacePath]); return { verified: true, workspacePath }; },
      runPac: async (_command, args) => { calls.push(["pac", ...args]); return { stdout: "ok", stderr: "" }; },
      snapshotWorkspace: async (_workspacePath) => "a".repeat(64),
      applyMutation: async ({ workspacePath, surfaces, reasonCodes }) => {
        calls.push(["mutate", workspacePath, surfaces.join("+"), reasonCodes.join("+")]);
        return { verified: true, changedFiles: ["actions/mahoraga-tool.action.mcs.yml"] };
      },
      validateWorkspace: async ({ workspacePath }) => { calls.push(["validate", workspacePath]); return { verified: true }; },
    },
  };
}

test("PAC sync requires Windows and a known logical agent before invoking PAC", async () => {
  let invoked = false;
  await assert.rejects(() => executeCopilotStudioPacSync(request, {
    platform: "linux",
    runPac: async () => { invoked = true; return {}; },
  }), /studio-pac-windows-required/);
  assert.equal(invoked, false);

  await assert.rejects(() => executeCopilotStudioPacSync({ ...request, alias: "unknown-agent" }, {
    platform: "win32",
    runPac: async () => { invoked = true; return {}; },
  }), /studio-pac-agent-invalid/);
  assert.equal(invoked, false);
});

test("PAC sync performs pull, bounded mutation, validation and push in order", async () => {
  const { calls, dependencies } = fixture();
  const result = await executeCopilotStudioPacSync(request, dependencies);
  assert.equal(result.verified, true);
  assert.deepEqual(result.phases, ["pull", "validate", "push"]);
  assert.equal(result.published, false);
  assert.deepEqual(calls.map((item) => item[0]), ["workspace", "pac", "mutate", "validate", "pac"]);
  assert.deepEqual(calls.filter((item) => item[0] === "pac").map((item) => item.slice(1, 3)), [
    ["copilot", "pull"],
    ["copilot", "push"],
  ]);
});

test("PAC sync refuses push when mutation or deterministic validation fails", async () => {
  for (const failure of ["mutation", "validation"]) {
    const { calls, dependencies } = fixture();
    if (failure === "mutation") dependencies.applyMutation = async () => ({ verified: false });
    if (failure === "validation") dependencies.validateWorkspace = async () => ({ verified: false });
    await assert.rejects(() => executeCopilotStudioPacSync(request, dependencies), /studio-pac-verification-failed/);
    assert.equal(calls.some((item) => item[0] === "pac" && item[2] === "push"), false);
  }
});

test("PAC sync publishes only after verified push, evaluation, and explicit publish request", async () => {
  const { calls, dependencies } = fixture();
  dependencies.evaluateAgent = async () => ({ verified: true, state: "passing", score: 0.95 });
  const result = await executeCopilotStudioPacSync({ ...request, publish: true }, dependencies);
  assert.deepEqual(result.phases, ["pull", "validate", "push", "evaluate", "publish"]);
  assert.equal(result.published, true);
  const pacCalls = calls.filter((item) => item[0] === "pac");
  assert.equal(pacCalls.at(-1)[2], "publish");
});

test("PAC sync detects remote drift and does not push unknown changes", async () => {
  const { calls, dependencies } = fixture();
  let snapshots = 0;
  dependencies.snapshotWorkspace = async () => (++snapshots === 1 ? "a".repeat(64) : "b".repeat(64));
  dependencies.applyMutation = async ({ workspacePath }) => {
    calls.push(["mutate", workspacePath]);
    return { verified: true, changedFiles: ["agent.mcs.yaml"] };
  };
  dependencies.verifyMutationBase = async () => false;
  await assert.rejects(() => executeCopilotStudioPacSync(request, dependencies), /studio-pac-drift-detected/);
  assert.equal(calls.some((item) => item[0] === "pac" && item[2] === "push"), false);
});

test("PAC sync fails closed when local workspace drifts after validation and before push", async () => {
  const { calls, dependencies } = fixture();
  const digests = ["a".repeat(64), "b".repeat(64), "c".repeat(64)];
  dependencies.snapshotWorkspace = async () => digests.shift() ?? "c".repeat(64);
  await assert.rejects(() => executeCopilotStudioPacSync(request, dependencies), /studio-pac-drift-detected/);
  assert.equal(calls.some((item) => item[0] === "pac" && item[2] === "push"), false);
});

test("PAC sync fails closed when post-push pull does not match the validated workspace", async () => {
  const { calls, dependencies } = fixture();
  const digests = ["a".repeat(64), "b".repeat(64), "b".repeat(64), "c".repeat(64)];
  dependencies.snapshotWorkspace = async () => digests.shift() ?? "c".repeat(64);
  dependencies.evaluateAgent = async () => ({ verified: true, state: "passing", score: 0.95 });
  await assert.rejects(
    () => executeCopilotStudioPacSync({ ...request, publish: true }, dependencies),
    /studio-pac-post-push-verification-failed/,
  );
  const pacOperations = calls.filter((item) => item[0] === "pac").map((item) => item[2]);
  assert.deepEqual(pacOperations, ["pull", "push", "pull"]);
  assert.equal(pacOperations.includes("publish"), false);
});

test("PAC sync receipt is sanitized and contains no agent content or identifiers", async () => {
  const { dependencies } = fixture();
  const result = await executeCopilotStudioPacSync(request, dependencies);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("mhg_enterprise_core"), false);
  assert.equal(serialized.includes("C:\\Mahoraga\\Studio"), false);
  assert.match(result.workspaceSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.changedFileKinds, ["action"]);
});
