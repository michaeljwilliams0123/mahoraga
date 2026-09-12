import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ensureCopilotStudioWorkspace } from "../src/copilot-studio-pac-sync.mjs";

test("missing Studio workspace is cloned from trusted schema and environment bindings into the fixed alias folder", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mhg-studio-clone-"));
  const workspacePath = path.join(root, "enterprise-core");
  const calls = [];
  try {
    const result = await ensureCopilotStudioWorkspace({
      workspaceRoot: root,
      workspacePath,
      binding: {
        alias: "enterprise-core",
        workspaceName: "enterprise-core",
        botSchemaName: "mhg_enterprise_core",
        environmentId: "00000000-0000-0000-0000-000000000001",
      },
      runPac: async (_command, args) => {
        calls.push(args);
        await mkdir(workspacePath, { recursive: true });
        return { stdout: "cloned", stderr: "" };
      },
    });
    assert.equal(result.verified, true);
    assert.deepEqual(calls, [[
      "copilot", "clone", "--bot", "mhg_enterprise_core",
      "--environment", "00000000-0000-0000-0000-000000000001",
      "--output-dir", root,
    ]]);
    assert.equal(calls[0].includes("--display-name"), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("clone bootstrap fails closed without trusted schema and environment bindings", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mhg-studio-clone-"));
  try {
    for (const binding of [
      { alias: "general-mahoraga", workspaceName: "general-mahoraga", botSchemaName: "" , environmentId: "00000000-0000-0000-0000-000000000001" },
      { alias: "general-mahoraga", workspaceName: "general-mahoraga", botSchemaName: "mhg_general_mahoraga", environmentId: "" },
    ]) {
      await assert.rejects(() => ensureCopilotStudioWorkspace({
        workspaceRoot: root,
        workspacePath: path.join(root, "general-mahoraga"),
        binding,
        runPac: async () => { throw new Error("must-not-run"); },
      }), /studio-pac-agent-binding-missing/);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
