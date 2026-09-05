import test from "node:test";
import assert from "node:assert/strict";
import { executeArtifactAuthoringCapability } from "../src/artifact-authoring.mjs";

function fakeStore() {
  const calls = [];
  return {
    calls,
    async put(input) {
      calls.push(input);
      return { id: "art-00000000-0000-0000-0000-000000000000", name: input.name, mimeType: input.mimeType, sizeBytes: input.bytes.length, sha256: "a".repeat(64) };
    },
  };
}

test("artifact.create stores an allowed UTF-8 artifact through the existing store", async () => {
  const store = fakeStore();
  const result = await executeArtifactAuthoringCapability("artifact.create", {
    id: "task-artifact-1",
    artifact: { name: "report.md", mimeType: "text/markdown", encoding: "utf8", content: "# Mahoraga\n" },
  }, { store });
  assert.equal(result.verified, true);
  assert.equal(result.artifactCreated, true);
  assert.equal(store.calls.length, 1);
  assert.equal(store.calls[0].source, "api");
  assert.equal(store.calls[0].bytes.toString("utf8"), "# Mahoraga\n");
  assert.equal(result.artifact.name, "report.md");
});

test("artifact.create accepts base64 bytes for an existing artifact MIME", async () => {
  const store = fakeStore();
  const result = await executeArtifactAuthoringCapability("artifact.create", {
    id: "task-artifact-2",
    artifact: { name: "deck.pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", encoding: "base64", content: Buffer.from("PK-test").toString("base64") },
  }, { store });
  assert.equal(result.verified, true);
  assert.equal(store.calls[0].bytes.toString("utf8"), "PK-test");
});

test("artifact.create rejects unsupported MIME types and mismatched extensions", async () => {
  const store = fakeStore();
  await assert.rejects(
    executeArtifactAuthoringCapability("artifact.create", { id: "task-x", artifact: { name: "payload.exe", mimeType: "application/octet-stream", encoding: "base64", content: "AA==" } }, { store }),
    (error) => error?.code === "artifact-authoring-mime-forbidden",
  );
  await assert.rejects(
    executeArtifactAuthoringCapability("artifact.create", { id: "task-y", artifact: { name: "report.txt", mimeType: "application/pdf", encoding: "base64", content: "AA==" } }, { store }),
    (error) => error?.code === "artifact-authoring-extension-mismatch",
  );
});
