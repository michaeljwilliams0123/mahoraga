import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const producerModule = await import("../src/sovereign-candidate-producer.mjs").catch(() => null);
const workflow = await readFile(new URL("../.github/workflows/sovereign-eight-hour-cycle.yml", import.meta.url), "utf8");

test("scan proposes a bounded operator scan report when it is missing", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  const enhancement = producerModule.scanForSafeEnhancement({
    fileExists: () => false,
    gapAudit: { open: [] },
  });
  assert.equal(enhancement.id, "operator-scan-report");
  assert.deepEqual(enhancement.changedFiles, ["scripts/sovereign-scan-report.mjs"]);
});

test("scan returns no actionable work once the operator scan report exists", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  const enhancement = producerModule.scanForSafeEnhancement({
    fileExists: (relative) => relative === "scripts/sovereign-scan-report.mjs",
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
  const first = producerModule.candidateChangedFilesDigest(["scripts/sovereign-scan-report.mjs", "README.md"]);
  const second = producerModule.candidateChangedFilesDigest(["README.md", "scripts/sovereign-scan-report.mjs"]);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, second);
});

test("operator scan report script is content-bounded and zero-credit", () => {
  assert.ok(producerModule, "sovereign candidate producer module should exist");
  const rendered = producerModule.renderOperatorScanReportScript();
  assert.match(rendered, /buildGapAudit/);
  assert.match(rendered, /blockedGapIds/);
  assert.doesNotMatch(rendered, /OPENAI_API_KEY|sk-proj|npm install|npx/);
});

test("scheduler connects the GitHub-native producer and one-time ten-minute smoke", () => {
  assert.match(workflow, /pull-requests:\s*write/);
  assert.match(workflow, /MAHORAGA_CANDIDATE_PRODUCER:\s*github-native/);
  assert.match(workflow, /sovereign-producer-smoke-v1/);
  assert.match(workflow, /createDeploymentAnchor/);
});
