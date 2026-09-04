import test from "node:test";
import assert from "node:assert/strict";

const producerModule = await import("../src/sovereign-candidate-producer.mjs").catch(() => null);

test("scan proposes a bounded operator scan enhancement when the command is missing", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  const enhancement = producerModule.scanForSafeEnhancement({
    packageJson: { scripts: { verify: "node test.mjs" } },
    gapAudit: { open: [] },
  });
  assert.equal(enhancement.id, "operator-scan-command");
  assert.deepEqual(enhancement.changedFiles, ["package.json"]);
});

test("scan returns no actionable work once the operator scan command exists", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  const enhancement = producerModule.scanForSafeEnhancement({
    packageJson: { scripts: { "sovereign:scan": "node src/sovereign-candidate-producer.mjs --scan-only" } },
    gapAudit: { open: [{ id: "signed-browser-session", state: "blocked" }] },
  });
  assert.equal(enhancement, null);
});

test("producer refuses trust-plane changed paths", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  assert.throws(
    () => producerModule.assertSafeCandidatePaths([".github/workflows/release.yml"]),
    /trust-plane/,
  );
});

test("changed-files digest is deterministic and order-independent", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  const first = producerModule.candidateChangedFilesDigest(["package.json", "README.md"]);
  const second = producerModule.candidateChangedFilesDigest(["README.md", "package.json"]);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, second);
});

test("package enhancement adds only the sovereign scan command", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  const before = { name: "project-mahoraga-v2", scripts: { verify: "npm test" } };
  const after = producerModule.applyOperatorScanEnhancement(before);
  assert.equal(after.scripts.verify, "npm test");
  assert.equal(after.scripts["sovereign:scan"], "node src/sovereign-candidate-producer.mjs --scan-only");
});
