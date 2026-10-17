import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/sovereign-candidate-receipt.mjs", import.meta.url));
const makeCycle = () => ({
  status: "candidate-ready",
  cycleId: "a".repeat(64),
  windowStartUtc: "2026-10-16T17:24:02.000Z",
  candidate: {
    baseSha: "b".repeat(40),
    headSha: "c".repeat(40),
    branch: "feature/sovereign-acceptance",
    pullRequestNumber: 1136,
    changedFilesDigest: "d".repeat(64),
  },
  hiddenPayload: "never publish",
});
function invoke(temp, payload) {
  return spawnSync(process.execPath, [script], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    env: { ...process.env, RUNNER_TEMP: temp },
    timeout: 10_000,
  });
}

test("CLI persists exact candidate receipt to the workflow upload path without exposing payload", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "mahoraga-candidate-receipt-"));
  try {
    const result = invoke(temp, makeCycle());
    assert.equal(result.status, 0, result.stderr);
    const receiptFile = path.join(temp, "sovereign-candidate-receipt.json");
    assert.equal(existsSync(receiptFile), true, "workflow artifact path must exist");
    const raw = readFileSync(receiptFile, "utf8");
    const receipt = JSON.parse(raw);
    assert.equal(receipt.status, "candidate-ready");
    assert.equal(receipt.cycleId, "a".repeat(64));
    assert.equal(receipt.baseSha, "b".repeat(40));
    assert.equal(receipt.headSha, "c".repeat(40));
    assert.equal(receipt.pullRequestNumber, 1136);
    assert.equal(receipt.changedFilesDigest, "d".repeat(64));
    assert.equal(receipt.creditCost, 0);
    assert.equal(receipt.paidFallback, false);
    assert.doesNotMatch(raw, /never publish|hiddenPayload/);
    assert.equal(result.stdout.trim(), "");
    const duplicate = invoke(temp, makeCycle());
    assert.notEqual(duplicate.status, 0, "refuse silently overwriting immutable receipt");
    assert.equal(readFileSync(receiptFile, "utf8"), raw);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("CLI emits no artifact on no-candidate and rejects invalid provenance", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "mahoraga-no-candidate-"));
  try {
    const empty = invoke(temp, { status: "no-candidate", hiddenPayload: "never publish" });
    assert.equal(empty.status, 0, empty.stderr);
    assert.equal(existsSync(path.join(temp, "sovereign-candidate-receipt.json")), false);
    const cycle = makeCycle();
    cycle.candidate.headSha = cycle.candidate.baseSha;
    const invalid = invoke(temp, cycle);
    assert.notEqual(invalid.status, 0);
    assert.equal(existsSync(path.join(temp, "sovereign-candidate-receipt.json")), false);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
