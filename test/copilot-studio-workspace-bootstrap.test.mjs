import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ensureCopilotStudioWorkspace } from "../src/copilot-studio-pac-sync.mjs";

test("missing Studio workspace is cloned from trusted schema binding into the fixed alias folder", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mhg-studio-clone-"));
  const workspacePath = path.join(root, "enterprise-core");
  const calls = [];
  try {
    const result = await ensureCopilotStudioWorkspace({
      workspaceRoot: root,
      workspacePath,
      binding: { alias: "enterprise-core", workspaceName: "enterprise-core", botSchemaName: "mhg_enterprise_core" },
      runPac: async (_command, args) => {
        calls.push(args);
        await mkdir(workspacePath, { recursive: true });
        return { stdout: "cloned", stderr: "" };
      },
    });
    assert.equal(result.verified, true);
    assert.deepEqual(calls, [[
      "copilot", "clone", "--bot", "mhg_enterprise_core",
      "--display-name", "enterprise-core", "--output-dir", root,
    ]]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("clone bootstrap fails closed without a trusted schema binding", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mhg-studio-clone-"));
  try {
    await assert.rejects(() => ensureCopilotStudioWorkspace({
      workspaceRoot: root,
      workspacePath: path.join(root, "general-mahoraga"),
      binding: { alias: "general-mahoraga", workspaceName: "general-mahoraga", botSchemaName: "" },
      runPac: async () => { throw new Error("must-not-run"); },
    }), /studio-pac-agent-binding-missing/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
