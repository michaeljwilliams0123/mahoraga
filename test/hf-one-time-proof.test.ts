import test from "node:test";
import assert from "node:assert/strict";
import { HUGGING_FACE_ONE_TIME_PROOF_UTC_MS as due, HUGGING_FACE_ONE_TIME_PROOF_EXPIRES_UTC_MS as expire,
  shouldObserveHuggingFaceNow } from "../deploy/cloudflare-execution-runtime/hf-one-time-proof.ts";

const sha = "a".repeat(40);
const prior = { source_sha: sha, observed_at: due - 3_600_000, next_check_at: due + 23 * 3_600_000 };

test("normal due-time throttle is preserved ahead of 6 PM EDT", () => {
  assert.equal(shouldObserveHuggingFaceNow(due-1, sha, prior), false);
  assert.equal(shouldObserveHuggingFaceNow(due-3_600_000, sha, { ...prior, next_check_at:due-5_000_000 }), true);
});
test("force exactly one 6 PM EDT scan against prior observation despite daily throttle", () => {
  assert.equal(shouldObserveHuggingFaceNow(due, sha, prior), true);
  assert.equal(shouldObserveHuggingFaceNow(due+5*60_000, sha, prior), true);
  assert.equal(shouldObserveHuggingFaceNow(due+5*60_000, sha, { ...prior, observed_at:due, next_check_at:due+24*3_600_000 }), false);
  assert.equal(shouldObserveHuggingFaceNow(due+10*60_000, sha, { ...prior, observed_at:due+5000 }), false);
});
test("override expires and never alters production model admission", () => {
  assert.equal(shouldObserveHuggingFaceNow(expire, sha, prior), false);
  assert.equal(shouldObserveHuggingFaceNow(expire+1000, sha, prior), false);
});
test("changing deployed source causes one independent observation while invalid input fails closed", () => {
  assert.equal(shouldObserveHuggingFaceNow(due-10_000, "b".repeat(40), prior), true);
  assert.equal(shouldObserveHuggingFaceNow(NaN, sha, prior), false);
  assert.equal(shouldObserveHuggingFaceNow(due, "main", prior), false);
  assert.equal(shouldObserveHuggingFaceNow(due, sha, undefined), true);
});
