import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileEvidencePack } from "../src/evidence-compiler.mjs";

test("evidence compiler includes deterministic source provenance and excludes unsafe content", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-evidence-root-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, "safe.js"), "export const answer = 42;\n", "utf8");
  writeFileSync(path.join(root, ".env"), "API_KEY=do-not-pack\n", "utf8");
  writeFileSync(path.join(root, "large.txt"), "x".repeat(200), "utf8");
  writeFileSync(path.join(root, "binary.bin"), Buffer.from([0, 1, 2, 3]));
  const pack = await compileEvidencePack({
    root,
    selectedPaths: ["safe.js", ".env", "large.txt", "binary.bin"],
    revision: "a".repeat(40),
    limits: { maximumFiles: 20, maximumFileBytes: 64, maximumTotalBytes: 1024, includeContentBytes: 64 },
  });
  assert.deepEqual(pack.files.map((item) => item.path), ["safe.js"]);
  assert.equal(pack.files[0].content, "export const answer = 42;\n");
  assert.match(pack.files[0].sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(pack.excluded.map((item) => item.reasonCode).sort(), ["binary", "oversized", "suspicious-path"]);
  assert.match(pack.structuralDigest, /^[a-f0-9]{64}$/);
});

test("evidence compiler rejects lexical traversal and symlink escape", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-evidence-confined-"));
  const outside = mkdtempSync(path.join(os.tmpdir(), "mahoraga-evidence-outside-"));
  t.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); });
  writeFileSync(path.join(outside, "secret.txt"), "outside", "utf8");
  symlinkSync(outside, path.join(root, "escape"), process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(() => compileEvidencePack({ root, selectedPaths: ["../outside.txt"], revision: "b".repeat(40) }), /evidence-path-invalid/);
  await assert.rejects(() => compileEvidencePack({ root, selectedPaths: ["escape/secret.txt"], revision: "b".repeat(40) }), /evidence-path-escape/);
});
