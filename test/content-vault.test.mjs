import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createContentVault, loadProtectedMasterKey } from "../src/content-vault.mjs";

const OWNER = { ownerType: "task", ownerId: "mhg-vault-owner", classification: "local-only" };

test("content vault encrypts owner-bound content and exposes metadata only", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-content-vault-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const vault = await createContentVault({ root, masterKey: Buffer.alloc(32, 7) });
  const reference = vault.put(Buffer.from("private content"), { ...OWNER, ttlMs: 60_000 });

  assert.match(reference, /^vault:[a-f0-9-]{36}$/);
  assert.equal(vault.get(reference, OWNER).toString("utf8"), "private content");
  assert.deepEqual(Object.keys(vault.metadata(reference, OWNER)).sort(), [
    "classification", "createdAt", "expiresAt", "ownerId", "ownerType", "reference", "schemaVersion", "sha256", "sizeBytes",
  ]);
  assert.throws(() => vault.get(reference, { ...OWNER, ownerId: "mhg-other-owner" }), /vault-owner-mismatch/);
  assert.throws(() => vault.get(reference, { ...OWNER, classification: "enterprise" }), /vault-classification-mismatch/);
  assert.throws(() => vault.get("vault:../../outside", OWNER), /vault-reference-invalid/);
});

test("content vault rejects ciphertext tampering and expires records", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-content-vault-tamper-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  let clock = new Date("2030-01-01T00:00:00.000Z");
  const vault = await createContentVault({ root, masterKey: Buffer.alloc(32, 9), now: () => clock });
  const reference = vault.put(Buffer.from("tamper target"), { ...OWNER, ttlMs: 60_000 });
  const id = reference.slice(6);
  const target = path.join(root, id.slice(0, 2), `${id}.vault`);
  const record = JSON.parse(readFileSync(target, "utf8"));
  record.ciphertext = Buffer.from("changed ciphertext").toString("base64");
  record.metadata.sizeBytes = Buffer.from("changed ciphertext").length;
  writeFileSync(target, JSON.stringify(record));
  assert.throws(() => vault.get(reference, OWNER), /vault-authentication-failed/);

  const expiring = vault.put(Buffer.from("expires"), { ...OWNER, ttlMs: 1_000 });
  clock = new Date("2030-01-01T00:00:02.000Z");
  assert.throws(() => vault.get(expiring, OWNER), /vault-record-expired/);
  assert.equal(vault.deleteExpired(), 1);
});

test("DPAPI helper failures are typed on Windows", { skip: process.platform !== "win32" }, async () => {
  await assert.rejects(() => loadProtectedMasterKey({
    keyFile: path.join(os.tmpdir(), "mahoraga-missing-key.dpapi"),
    keyHelperScript: path.join(os.tmpdir(), "missing-content-vault-key.ps1"),
    powershellExecutable: "powershell.exe",
  }), /vault-dpapi-helper-failed/);
});
