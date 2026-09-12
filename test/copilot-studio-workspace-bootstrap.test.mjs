import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ensureCopilotStudioWorkspace } from "../src/copilot-studio-pac-sync.mjs";

const ENVIRONMENT_ID = "00000000-0000-4000-8000-000000000001";
const binding = Object.freeze({
  alias: "enterprise-core",
  workspaceName: "enterprise-core",
  botSchemaName: "mhg_enterprise_core",
  environmentId: ENVIRONMENT_ID,
});

test("missing Studio workspace is cloned from trusted schema and environment bindings into the fixed alias folder", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mhg-studio-clone-"));
  const workspacePath = path.join(root, "enterprise-core");
  const calls = [];
  try {
    const result = await ensureCopilotStudioWorkspace({
      workspaceRoot: root,
      workspacePath,
      binding,
      runPac: async (_command, args) => {
        calls.push(args);
        await mkdir(workspacePath, { recursive: true });
        return { stdout: "cloned", stderr: "" };
      },
    });
    assert.equal(result.verified, true);
    assert.deepEqual(calls, [[
      "copilot", "clone", "--bot", "mhg_enterprise_core",
      "--display-name", "enterprise-core",
      "--environment", ENVIRONMENT_ID,
      "--output-dir", root,
    ]]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("clone bootstrap fails closed without trusted schema and environment bindings", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mhg-studio-clone-"));
  try {
    for (const candidate of [
      { alias: "general-mahoraga", workspaceName: "general-mahoraga", botSchemaName: "", environmentId: ENVIRONMENT_ID },
      { alias: "general-mahoraga", workspaceName: "general-mahoraga", botSchemaName: "mhg_general_mahoraga", environmentId: "" },
    ]) {
      await assert.rejects(() => ensureCopilotStudioWorkspace({
        workspaceRoot: root,
        workspacePath: path.join(root, "general-mahoraga"),
        binding: candidate,
        runPac: async () => { throw new Error("must-not-run"); },
      }), /studio-pac-agent-binding-missing/);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("existing Studio workspace is rejected when Mahoraga has no trusted binding receipt", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mhg-studio-existing-"));
  const workspacePath = path.join(root, "enterprise-core");
  await mkdir(workspacePath, { recursive: true });
  try {
    await assert.rejects(() => ensureCopilotStudioWorkspace({
      workspaceRoot: root,
      workspacePath,
      binding,
      runPac: async () => { throw new Error("must-not-run"); },
    }), /studio-pac-workspace-binding-missing/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("fresh trusted clone can be reused only with the same alias schema and environment binding", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mhg-studio-reuse-"));
  const workspacePath = path.join(root, "enterprise-core");
  let cloneCalls = 0;
  try {
    const first = await ensureCopilotStudioWorkspace({
      workspaceRoot: root,
      workspacePath,
      binding,
      runPac: async () => {
        cloneCalls += 1;
        await mkdir(workspacePath, { recursive: true });
        return { stdout: "cloned", stderr: "" };
      },
    });
    assert.equal(first.verified, true);
    assert.equal(cloneCalls, 1);

    const reused = await ensureCopilotStudioWorkspace({
      workspaceRoot: root,
      workspacePath,
      binding,
      runPac: async () => { throw new Error("must-not-run"); },
    });
    assert.equal(reused.verified, true);
    assert.equal(reused.bootstrapped, false);

    await assert.rejects(() => ensureCopilotStudioWorkspace({
      workspaceRoot: root,
      workspacePath,
      binding: { ...binding, environmentId: "00000000-0000-4000-8000-000000000099" },
      runPac: async () => { throw new Error("must-not-run"); },
    }), /studio-pac-workspace-binding-mismatch/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
