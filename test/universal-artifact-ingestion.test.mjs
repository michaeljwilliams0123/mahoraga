import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { createContentVault } from "../src/content-vault.mjs";
import { createUniversalArtifactSource, ingestUniversalArtifact, validateUniversalArtifactRecord } from "../src/universal-artifact-ingestion.mjs";

test("universal artifact ingestion encrypts raw bytes and exposes normalized metadata", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-universal-artifact-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const vault = await createContentVault({ root, masterKey: Buffer.alloc(32, 5) });
  const source = createUniversalArtifactSource({
    sourceType: "message-attachment",
    provider: "microsoft",
    objectId: "attachment-1",
    locator: "outlook://message/attachment-1",
    accountBoundary: "personal",
  });
  const record = ingestUniversalArtifact({
    source,
    fileName: "notes.csv",
    mimeType: "text/csv",
    bytes: Buffer.from("name,total\nbooks,3\n"),
    ttlMs: 60_000,
  }, { contentVault: vault, now: () => new Date("2026-09-09T00:00:00.000Z") });

  assert.equal(record.artifactKind, "tabular");
  assert.equal(record.classification, "personal");
  assert.deepEqual(record.routeHints, ["artifact.inspect", "m365.open"]);
  assert.match(record.contentReference, /^vault:/);
  assert.equal(vault.get(record.contentReference, { ownerType: "artifact", ownerId: record.artifactId, classification: "personal" }).toString("utf8"), "name,total\nbooks,3\n");
});

test("universal artifact ingestion validates image/document features without leaking content", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-universal-artifact-image-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const vault = await createContentVault({ root, masterKey: Buffer.alloc(32, 8) });
  const png = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,2,0,0,0,3,8,2,0,0,0,0,0,0,0]);
  const record = ingestUniversalArtifact({
    source: { sourceType: "cloud-file", provider: "google", objectId: "drive-1", locator: "https://drive.google.com/file/d/1", accountBoundary: "personal" },
    fileName: "image.png",
    mimeType: "image/png",
    bytes: png,
  }, { contentVault: vault, now: () => new Date("2026-09-09T00:00:00.000Z") });
  assert.equal(record.features.width, 2);
  assert.equal(record.features.height, 3);
  assert.deepEqual(record.routeHints, ["artifact.inspect", "google.open"]);
  assert.deepEqual(validateUniversalArtifactRecord(record), record);
});

