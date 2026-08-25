import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";
import { createUpdateManifest, validateUpdateManifest } from "../src/update-contract.mjs";

const input = {
  version: "3.5.0", channel: "stable", tag: "v3.5.0", commit: "a".repeat(40),
  artifactName: "mahoraga-3.5.0.zip", sizeBytes: 1234, sha256: "b".repeat(64),
};

test("update manifest fixes source, digest, and verified local automatic activation", () => {
  const manifest = createUpdateManifest(input, { now: "2026-08-24T12:00:00.000Z" });
  assert.equal(manifest.repository, "michaeljwilliams0123/mahoraga");
  assert.deepEqual(manifest.activation, { automatic: true, mode: "verified-auto-local", authority: "mahoraga", rollbackRequired: true });
  assert.equal(validateUpdateManifest(manifest).artifact.sha256, "b".repeat(64));
  assert.throws(() => validateUpdateManifest({ ...manifest, activation: { ...manifest.activation, automatic: false } }), /activation policy/);
  assert.throws(() => validateUpdateManifest({ ...manifest, repository: "other/repo" }), /repository/);
});

test("release workflow is owner-only, verified, attested, and never activates a device", async () => {
  const source = await readFile(path.join(ROOT, ".github", "workflows", "release.yml"), "utf8");
  assert.match(source, /github\.actor == github\.repository_owner/);
  assert.match(source, /npm run verify/);
  assert.match(source, /actions\/attest-build-provenance@[a-f0-9]{40} # v3/);
  assert.match(source, /node scripts\/update-manifest\.mjs validate/);
  assert.doesNotMatch(source, /Expand-Archive|start-production|OPENAI_API_KEY|\$\{\{\s*secrets\./i);
  assert.match(source, /Eligible for verified local rollout with mandatory rollback evidence/);
});
