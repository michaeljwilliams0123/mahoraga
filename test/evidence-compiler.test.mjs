import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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

test("evidence compiler never traverses VCS metadata or credential-like content", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-evidence-privacy-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, ".git"), { recursive: true });
  mkdirSync(path.join(root, ".ssh"), { recursive: true });
  writeFileSync(path.join(root, ".git", "config"), `https://${"github_" + "pat_abcdefghijklmnopqrstuvwxyz0123456789"}@example.com/example/repo.git`, "utf8");
  writeFileSync(path.join(root, ".ssh", "known_hosts"), "ssh-rsa AAAA", "utf8");
  writeFileSync(path.join(root, "notes.txt"), "API_KEY=abcdefghijklmnopqrstuvwxyz0123456789\n", "utf8");
  writeFileSync(path.join(root, "safe.txt"), "safe evidence\n", "utf8");
  const pack = await compileEvidencePack({ root, selectedPaths: [".git", ".ssh", "notes.txt", "safe.txt"], revision: "c".repeat(40) });
  assert.deepEqual(pack.files.map((item) => item.path), ["safe.txt"]);
  assert.ok(pack.excluded.some((item) => item.path === "notes.txt" && item.reasonCode === "secret-content"));
  assert.doesNotMatch(JSON.stringify(pack), /github_pat_|API_KEY|known_hosts/);
});
