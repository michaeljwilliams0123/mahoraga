import test from "node:test";
import assert from "node:assert/strict";
import { NativeContinuityWatch, judgeNativeObservation, type NativeEvidence, type NativeObservation } from "../deploy/cloudflare-execution-runtime/native-continuity.ts";

const sha = "a".repeat(40);
const valid: NativeObservation = { sourceSha: sha, runtimeSha: sha, verifyRunId: 11, ubuntuPassed: true,
  windowsPassed: true, acceptanceRunId: 12, acceptancePassed: true };
function harness() {
  let current: NativeEvidence | null = null;
  const history: NativeEvidence[] = [];
  const store = { load: () => current, save: (v: NativeEvidence) => { current = { ...v }; },
    archive: (v: NativeEvidence) => { history.push({ ...v }); } };
  return { store, current: () => current, history };
}
test("only same-source exact-main Ubuntu/Windows and acceptance qualify for a native write", () => {
  assert.equal(judgeNativeObservation(valid).phase, "accepted");
  assert.equal(judgeNativeObservation({ ...valid, sourceSha: "b".repeat(40) }).reason, "native-source-production-drift");
  assert.equal(judgeNativeObservation({ ...valid, windowsPassed: false }).reason, "native-exact-main-verify-unproven");
  assert.equal(judgeNativeObservation({ ...valid, acceptanceRunId: null }).reason, "native-workspace-acceptance-unproven");
});
test("writes once and persists exact evidence without inference or branch modification", async () => {
  const h = harness(); let posts = 0;
  const watch = new NativeContinuityWatch(h.store, sha);
  const publish = async () => { posts++; return { alreadyPresent: false, id: 101 }; };
  const receipt = await watch.check(async () => valid, publish, 1000);
  assert.equal(receipt.publication, "published");
  assert.equal(receipt.publicationId, 101);
  assert.equal(receipt.phase, "accepted");
  assert.equal((await watch.check(async () => valid, publish, 1001)).publication, "published");
  await watch.check(async () => valid, publish, 1000 + 15 * 60_000);
  assert.equal(posts, 1);
  assert.equal(h.history.length, 2);
});
test("missing verification prevents comments, preserves held source evidence", async () => {
  const h = harness(); let posts = 0;
  const v = await new NativeContinuityWatch(h.store, sha).check(
    async () => ({ ...valid, ubuntuPassed: false }),
    async () => { posts++; return { alreadyPresent: false, id: 2 }; }, 1000);
  assert.equal(v.phase, "held"); assert.equal(v.publication, "not-authorized"); assert.equal(posts, 0);
});
test("failed write is held; retry reconciles existing comment and never blindly duplicates", async () => {
  const h = harness(); let called = 0;
  const watch = new NativeContinuityWatch(h.store, sha);
  const first = await watch.check(async () => valid, async () => { called++; throw Error("scope-denied"); }, 1000);
  assert.equal(first.publication, "held");
  assert.equal(first.reason, "native-publication-unavailable");
  assert.equal((await watch.check(async () => valid, async () => { called++; return { id: 13, alreadyPresent: true }; }, 1001)).publication, "held");
  const retry = await watch.check(async () => valid, async () => { called++; return { id: 13, alreadyPresent: true }; }, first.nextCheckAt);
  assert.equal(retry.publication, "already-present"); assert.equal(called, 2);
});
test("failed inspection produces durable hold rather than a fabricated acceptance", async () => {
  const h = harness();
  const r = await new NativeContinuityWatch(h.store, sha).check(async () => { throw Error("offline"); },
    async () => { throw Error("must-not-publish"); }, 2000);
  assert.equal(r.phase, "held"); assert.equal(r.verifyRunId, null);
});
