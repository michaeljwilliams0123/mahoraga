import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { snapshotCopilotStudioWorkspace } from "../src/copilot-studio-pac-sync.mjs";

test("workspace snapshot changes when file content changes without renaming files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mhg-studio-snapshot-"));
  try {
    await mkdir(path.join(root, "actions"), { recursive: true });
    const file = path.join(root, "actions", "tool.action.mcs.yml");
    await writeFile(file, "name: before\n", "utf8");
    const before = await snapshotCopilotStudioWorkspace(root);
    await writeFile(file, "name: after\n", "utf8");
    const after = await snapshotCopilotStudioWorkspace(root);
    assert.match(before, /^[a-f0-9]{64}$/);
    assert.match(after, /^[a-f0-9]{64}$/);
    assert.notEqual(before, after);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("workspace snapshot rejects symbolic links rather than following them", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "mhg-studio-snapshot-"));
  const outside = await mkdtemp(path.join(os.tmpdir(), "mhg-studio-outside-"));
  try {
    await writeFile(path.join(outside, "secret.txt"), "outside\n", "utf8");
    try { await symlink(path.join(outside, "secret.txt"), path.join(root, "linked.txt"), "file"); }
    catch (error) {
      if (["EPERM", "EACCES", "UNKNOWN"].includes(error?.code)) { t.skip("symlink creation unavailable on this runner"); return; }
      throw error;
    }
    await assert.rejects(() => snapshotCopilotStudioWorkspace(root), /studio-pac-workspace-invalid/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
