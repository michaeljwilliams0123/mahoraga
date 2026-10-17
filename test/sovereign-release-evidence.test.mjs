import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { selectSovereignReleaseEvidence } from "../scripts/sovereign-release-evidence.mjs";

const source = "1c9d2d15fd813aa08a9f57073dc920746ee4290b";
const other = "e4188c2e450428a089513f631defa03f06f7767a";
const release = Object.freeze({
  name: "Publish Staged Mahoraga Update", id: 39040000001, status: "completed",
  conclusion: "success", head_sha: source, head_branch: "main",
  head_repository: { full_name: "michaeljwilliams0123/mahoraga" },
  updated_at: "2026-10-17T14:22:12Z",
});

test("admit successful staged release for exact current main only", () => {
  assert.deepEqual(selectSovereignReleaseEvidence({ workflow_runs: [release] },source),{
    status:"verified-release",sourceSha:source,releasedAt:release.updated_at,releaseRunId:release.id
  });
  assert.deepEqual(selectSovereignReleaseEvidence({workflow_runs:[release]},other),{
    status:"unavailable",sourceSha:other
  });
});

test("reject failing, queued, forked, renamed, non-main or incorrectly scoped evidence", () => {
  for(const change of [
    {conclusion:"failure"},{status:"queued"},{head_branch:"feature"},
    {head_repository:{full_name:"someone/fork"}},{name:"Verify Mahoraga"},
    {updated_at:"not-a-timestamp"},{id:0}
  ]) {
    assert.equal(selectSovereignReleaseEvidence({workflow_runs:[{...release,...change}]},source).status,"unavailable");
  }
});

test("use newest matching exact-main success, ignoring newer irrelevant releases", () => {
  const next={...release,id:39040000004,updated_at:"2026-10-17T15:30:42Z"};
  const ignored={...release,id:39040000005,head_sha:other,updated_at:"2026-10-17T16:30:42Z"};
  assert.equal(selectSovereignReleaseEvidence({workflow_runs:[release,ignored,next]},source).releaseRunId,next.id);
});

test("untrusted or malformed API payload never creates release proof",()=>{
  assert.throws(()=>selectSovereignReleaseEvidence({workflow_runs:[]},"main"),/source-sha-invalid/);
  assert.throws(()=>selectSovereignReleaseEvidence(null,source),/release-runs-invalid/);
  assert.throws(()=>selectSovereignReleaseEvidence({workflow_runs:"not-array"},source),/release-runs-invalid/);
});

test("the sovereign workflow admits only scheduled or owner-started jobs and preserves source-bound smoke",()=>{
  const workflow=readFileSync(new URL("../.github/workflows/sovereign-eight-hour-cycle.yml",import.meta.url),"utf8");
  assert.match(workflow,/cron: '17 \* \* \* \*'/);
  assert.match(workflow,/workflow_dispatch:/);
  assert.doesNotMatch(workflow,/^  workflow_run:/m);
  assert.doesNotMatch(workflow,/github\.event\.workflow_run/);
  assert.match(workflow,/github\.actor == 'michaeljwilliams0123'/);
  assert.match(workflow,/scripts\/sovereign-release-evidence\.mjs/g);
  assert.match(workflow,/steps\.smoke\.outputs\.smoke_tag/);
  assert.match(workflow,/SOVEREIGN_PRODUCER_SMOKE_TAG|smoke_tag=/);
  assert.match(workflow,/cost.*!=.*0|MAHORAGA_ZERO_CREDIT_MODEL_URL/);
});
