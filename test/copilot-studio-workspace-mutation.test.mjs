import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { applyCopilotStudioWorkspaceMutation, validateCopilotStudioWorkspace } from "../src/copilot-studio-workspace-mutation.mjs";

async function workspace(source = "kind: GptComponentMetadata\ninstructions: |-\n  Existing instruction.\n") {
  const root = await mkdtemp(path.join(os.tmpdir(), "mhg-studio-"));
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "agent.mcs.yaml"), source, "utf8");
  return root;
}

test("instruction mutation appends bounded Mahoraga guidance exactly once", async () => {
  const root = await workspace();
  try {
    const first = await applyCopilotStudioWorkspaceMutation({ alias: "general-mahoraga", workspacePath: root, surfaces: ["instructions"], reasonCodes: ["connected-agent-missing"] });
    const second = await applyCopilotStudioWorkspaceMutation({ alias: "general-mahoraga", workspacePath: root, surfaces: ["instructions"], reasonCodes: ["connected-agent-missing"] });
    const content = await readFile(path.join(root, "agent.mcs.yaml"), "utf8");
    assert.equal(first.verified, true);
    assert.equal(second.verified, true);
    assert.deepEqual(first.changedFiles, ["agent.mcs.yaml"]);
    assert.equal(content.match(/Mahoraga bounded guidance:/g)?.length, 1);
    assert.match(content, /delegate specialist work only to registered connected agents/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("workspace mutation rejects unsupported semantic surfaces instead of guessing schema", async () => {
  const root = await workspace();
  try {
    await assert.rejects(() => applyCopilotStudioWorkspaceMutation({ alias: "enterprise-core", workspacePath: root, surfaces: ["tools"], reasonCodes: ["tool-missing"] }), /studio-workspace-surface-unsupported/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("workspace validation requires a supported instructions block and no unresolved placeholders", async () => {
  const good = await workspace();
  const bad = await workspace("kind: GptComponentMetadata\ninstructions: TODO\n");
  try {
    const result = await validateCopilotStudioWorkspace({ workspacePath: good, surfaces: ["instructions"] });
    assert.equal(result.verified, true);
    const invalid = await validateCopilotStudioWorkspace({ workspacePath: bad, surfaces: ["instructions"] });
    assert.equal(invalid.verified, false);
  } finally {
    await rm(good, { recursive: true, force: true });
    await rm(bad, { recursive: true, force: true });
  }
});
