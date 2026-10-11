import test from "node:test";
import assert from "node:assert/strict";
import { MAX_BATCH, parseOptions, planArchivePrune, buildAtomicArchivePushArgs } from "../scripts/branch-archive-prune.mjs";
const MAIN = "9796e7dc83d6fb3b027f0ffe32a09bb9b075a140";
const HEAD = "c4b64059890bc48a8b981cea06c8c02673a9f916";
const branch = {
  name: "fix/already-contained", headSha: HEAD, aheadBy: 0, behindBy: 3,
  disposition: "delete-eligible", reason: "contained-ahead-zero",
  netChangedPathCount: 0, openPrCount: 0, activeRefCount: 0,
  prHistoryComplete: true, refVerified: true,
};
const audit = (row=branch) => ({
  schemaVersion: 1, kind: "branch-retention-ref-proof", readOnly: true,
  mainSha: MAIN, prHistoryComplete: true, rows: [row],
});
test("dry run is the default and execution requires explicit owner approval", () => {
  const args = ["--audit","audit.json","--main-sha",MAIN,"--branch",branch.name];
  assert.equal(parseOptions(args).execute, false);
  assert.throws(() => parseOptions([...args,"--execute"]), /required-owner-proof-missing/);
  assert.equal(parseOptions([...args,"--execute","--owner-approved"]).execute, true);
});
test("contained and independently archived no-change branches qualify", () => {
  const result = planArchivePrune(audit(),[branch.name],{mainSha:MAIN});
  assert.equal(result[0].proof,"contained-in-main");
  assert.match(result[0].archiveTag,/^branch-archive\/\d{4}-\d{2}-\d{2}\/fix\/already-contained$/);
  const noChange = { ...branch,name:"copilot/empty-task",aheadBy:1,disposition:"archive-then-delete"};
  assert.equal(planArchivePrune(audit(noChange),[noChange.name],{mainSha:MAIN})[0].proof,"no-changes-from-fork-point");
});
test("unique files, live references, open PRs, and missing evidence fail closed", () => {
  for (const mutate of [
    { disposition: "reconcile" }, { activeRefCount: 1 }, { openPrCount: 1 },
    { refVerified: false }, { prHistoryComplete: false }, { headSha: "invalid" },
    { aheadBy: 1 }, { disposition: "archive-then-delete",aheadBy:1,netChangedPathCount:1 },
  ]) assert.throws(() => planArchivePrune(audit({...branch,...mutate}),[branch.name],{mainSha:MAIN}), /branch-/);
});
test("invalid or stale main, duplicate requests and oversized batches never advance", () => {
  assert.throws(() => planArchivePrune(audit(),[branch.name],{mainSha:HEAD}),/audit-invalid-or-stale/);
  assert.throws(() => planArchivePrune(audit(),[branch.name,branch.name],{mainSha:MAIN}),/branch-list-invalid/);
  assert.throws(() => planArchivePrune(audit(),Array.from({length:MAX_BATCH+1},(_,i)=>"fix/"+i),{mainSha:MAIN}),/branch-list-invalid/);
  assert.throws(() => planArchivePrune({...audit(),prHistoryComplete:false},[branch.name],{mainSha:MAIN}),/audit-invalid-or-stale/);
});
test("branch paths and archive prefix cannot be used to forge refs", () => {
  for (const unsafe of ["-force","../danger","fix/../../escape","refs/heads/main","fix/foo@{0}"]) {
    assert.throws(() => planArchivePrune(audit({...branch,name:unsafe}),[unsafe],{mainSha:MAIN}));
  }
  assert.throws(() => planArchivePrune(audit(),[branch.name],{mainSha:MAIN,archivePrefix:"archive/.."}));
});
test("atomic push simultaneously archives and deletes only the exact verified branch head", () => {
  const [plan] = planArchivePrune(audit(),[branch.name],{mainSha:MAIN});
  assert.deepEqual(buildAtomicArchivePushArgs(plan), [
    "push", "--atomic", "--force-with-lease=refs/heads/fix/already-contained:" + HEAD,
    "origin", "refs/tags/" + plan.archiveTag + ":refs/tags/" + plan.archiveTag,
    ":refs/heads/fix/already-contained",
  ]);
});
