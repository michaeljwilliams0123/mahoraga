import test from "node:test";
import assert from "node:assert/strict";
import { observePromotionExecutor, runPromotionExecutorObservationCli } from "../scripts/promotion-executor-observation.ts";

const sha = "a".repeat(40), now = Date.parse("2026-10-15T12:00:00Z");
const repository = "michaeljwilliams0123/mahoraga";
const run = () => ({ id: 42, run_attempt: 2, head_sha: sha, head_branch: "main", path: ".github/workflows/cloudflare-execution-runtime.yml", repository: { full_name: repository }, head_repository: { full_name: repository }, event: "workflow_run", status: "in_progress", conclusion: null });
const job = () => ({ id: 71, run_id: 42, head_sha: sha, head_branch: "main", name: "Deploy and accept exact verified main", status: "in_progress", conclusion: null, labels: ["ubuntu-latest"], runner_id: 9, runner_name: "GitHub Actions 9", runner_group_id: 1, runner_group_name: "GitHub Actions", started_at: "2026-10-15T11:59:00Z", completed_at: null });
const input = () => ({ runId: 42, runAttempt: 2, jobId: 71, expectedSha: sha, token: "test-token", now: () => now });
function api(payloads: unknown[], inspect?: (url: string, init: RequestInit | undefined) => void): typeof fetch {
 return (async (url: string | URL | Request, init?: RequestInit) => {
  inspect?.(String(url), init);
  const payload = payloads.shift();
  assert.notEqual(payload, undefined, "unexpected extra API request");
  return payload instanceof Response ? payload : Response.json(payload);
 }) as typeof fetch;
}
const payloads = () => [run(), { total_count: 1, jobs: [job()] }, run()];

test("observes the exact attempt's executor through bounded authenticated GitHub reads without claiming substrate attestation", async () => {
 const calls: string[] = [];
 const receipt = await observePromotionExecutor({ ...input(), fetchImpl: api(payloads(), (url, init) => {
  calls.push(url);
  assert.equal(init?.method, "GET");
  assert.equal(init?.redirect, "error");
  assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-token");
  assert.ok(init?.signal);
 }) });
 assert.deepEqual(calls, [`https://api.github.com/repos/${repository}/actions/runs/42`, `https://api.github.com/repos/${repository}/actions/runs/42/attempts/2/jobs?per_page=100`, `https://api.github.com/repos/${repository}/actions/runs/42`]);
 assert.equal(receipt.repositoryIdentity, repository);
 assert.equal(receipt.sourceSha, sha);
 assert.equal(receipt.runAttempt, 2);
 assert.equal(receipt.runner.id, 9);
 assert.equal(receipt.runner.name, "GitHub Actions 9");
 assert.deepEqual(receipt.runner.labels, ["ubuntu-latest"]);
 assert.equal(receipt.observedAt, new Date(now).toISOString());
 assert.equal(receipt.substrateIdentity, "unattested");
 assert.equal(receipt.capabilityHealth, "unassessed");
 assert.equal(receipt.promotionAuthority, "unassessed");
 assert.equal("independent" in receipt, false);
 assert.equal("provenanceDigest" in receipt, false);
 assert.equal(JSON.stringify(receipt).includes("test-token"), false);
});

test("holds on rerun or source/repository/workflow drift during collection", async () => {
 for (const patch of [{ run_attempt: 3 }, { head_sha: "b".repeat(40) }, { repository: { full_name: "other/repo" } }, { head_repository: { full_name: "fork/mahoraga" } }, { path: ".github/workflows/verify.yml" }, { head_branch: "feature" }, { id: 43 }]) {
  await assert.rejects(observePromotionExecutor({ ...input(), fetchImpl: api([run(), { total_count: 1, jobs: [job()] }, { ...run(), ...patch }]) }), /executor-observation-run-mismatch/);
 }
});

test("does not transfer a job name or label identity across attempts, jobs, or source", async () => {
 for (const jobs of [[], [{ ...job(), id: 72 }], [{ ...job(), run_id: 43 }], [{ ...job(), head_sha: "b".repeat(40) }], [job(), job()], [{ ...job(), runner_id: 0 }], [{ ...job(), runner_name: "" }], [{ ...job(), labels: [] }], [{ ...job(), status: "queued" }]]) {
  await assert.rejects(observePromotionExecutor({ ...input(), fetchImpl: api([run(), { total_count: jobs.length, jobs }, run()]) }), /executor-observation-job-/);
 }
});

test("does not silently truncate an attempt's jobs or accept malformed API data", async () => {
 for (const payload of [{ total_count: 101, jobs: [job()] }, { total_count: 2, jobs: [job()] }, { total_count: 1, jobs: null }]) {
  await assert.rejects(observePromotionExecutor({ ...input(), fetchImpl: api([run(), payload]) }), /executor-observation-jobs-invalid/);
 }
 for (const response of [new Response("private-token-value", { status: 401 }), new Response("{}", { status: 302 }), new Response("invalid"), new Response("x".repeat(1_048_577))]) {
  await assert.rejects(observePromotionExecutor({ ...input(), fetchImpl: api([response]) }), /executor-observation-(http|json|response)/);
 }
});

test("rejects missing credentials and invalid selectors before making requests", async () => {
 for (const patch of [{ token: "" }, { token: "secret\nvalue" }, { runId: 0 }, { runAttempt: 0 }, { jobId: 0 }, { expectedSha: "main" }]) {
  await assert.rejects(observePromotionExecutor({ ...input(), ...patch, fetchImpl: api([]) }), /executor-observation-(credentials|input)-invalid/);
 }
});

test("CLI uses existing token and emits only a sanitized observation or bounded error", async () => {
 const output: string[] = [];
 const args = ["--run-id", "42", "--run-attempt", "2", "--job-id", "71", "--expected-sha", sha];
 assert.equal(await runPromotionExecutorObservationCli(args, { GH_TOKEN: "test-token" }, { fetchImpl: api(payloads()), now: () => now, write: value => output.push(value) }), 0);
 assert.equal(JSON.parse(output[0]!).runner.id, 9);
 output.length = 0;
 assert.equal(await runPromotionExecutorObservationCli([...args, "--api-url", "https://evil.example"], { GH_TOKEN: "test-token" }, { fetchImpl: api([]), write: value => output.push(value) }), 1);
 assert.equal(JSON.parse(output[0]!).reason, "executor-observation-cli-invalid");
 output.length = 0;
 assert.equal(await runPromotionExecutorObservationCli(args, { GH_TOKEN: "test-token" }, { fetchImpl: (async () => { throw new Error("test-token"); }) as typeof fetch, write: value => output.push(value) }), 1);
 assert.equal(output.join("").includes("test-token"), false);
});

test("preserves failed transport execution as dissent without turning it into capability health or promotion authority", async () => {
 const failedRun = { ...run(), status: "completed", conclusion: "failure" };
 const failedJob = { ...job(), status: "completed", conclusion: "failure" };
 const receipt = await observePromotionExecutor({ ...input(), fetchImpl: api([failedRun, { total_count: 1, jobs: [failedJob] }, failedRun]) });
 assert.equal(receipt.runStatus, "completed");
 assert.equal(receipt.runConclusion, "failure");
 assert.equal(receipt.jobConclusion, "failure");
 assert.equal(receipt.capabilityHealth, "unassessed");
 assert.equal(receipt.promotionAuthority, "unassessed");
});

test("does not stamp a slow or backwards-clock API collection as fresh", async () => {
 for (const end of [now + 10_001, now - 1]) {
  const times = [now, end];
  await assert.rejects(observePromotionExecutor({ ...input(), now: () => times.shift()!, fetchImpl: api(payloads()) }), /executor-observation-collection-expired/);
 }
});

test("records unavailable runner group metadata explicitly without inventing a group identity", async () => {
 const receipt = await observePromotionExecutor({ ...input(), fetchImpl: api([run(), { total_count: 1, jobs: [{ ...job(), runner_group_id: 0, runner_group_name: null }] }, run()]) });
 assert.equal(receipt.runner.groupId, 0);
 assert.equal(receipt.runner.groupName, null);
});

test("run and job lifecycle contradictions cannot be laundered as fresh observation", async () => {
 const cases = [
  [{ ...run(), status: "completed", conclusion: null }, { total_count: 1, jobs: [job()] }, run()],
  [{ ...run(), status: "in_progress", conclusion: "success" }, { total_count: 1, jobs: [job()] }, run()],
  [run(), { total_count: 1, jobs: [{ ...job(), status: "completed", conclusion: null }] }, run()],
  [run(), { total_count: 1, jobs: [{ ...job(), status: "in_progress", conclusion: "success" }] }, run()],
  [{ ...run(), status: "completed", conclusion: "success" }, { total_count: 1, jobs: [job()] }, { ...run(), status: "completed", conclusion: "success" }],
 ];
 for (const values of cases) await assert.rejects(observePromotionExecutor({ ...input(), fetchImpl: api(values) }), /executor-observation-(run|job)-(mismatch|identity-unavailable|lifecycle-invalid)/);
});

test("job timestamps must be consistent and cannot claim future execution", async () => {
 const variants = [
  { started_at: null },
  { started_at: "not-an-instant" },
  { started_at: "2026-10-15T12:10:00Z" },
  { status: "completed", conclusion: "success", completed_at: null },
  { status: "completed", conclusion: "success", completed_at: "2026-10-15T11:58:59Z" },
  { status: "completed", conclusion: "success", completed_at: "2026-10-15T12:20:00Z" },
  { status: "in_progress", conclusion: null, completed_at: "2026-10-15T11:59:30Z" },
 ];
 for (const patch of variants) {
  await assert.rejects(observePromotionExecutor({ ...input(), fetchImpl: api([run(), { total_count: 1, jobs: [{ ...job(), ...patch }] }, run()]) }), /executor-observation-job-(timing|lifecycle)-invalid/);
 }
 const receipt = await observePromotionExecutor({ ...input(), fetchImpl: api(payloads()) });
 assert.equal(receipt.jobStartedAt, "2026-10-15T11:59:00.000Z");
 assert.equal(receipt.jobCompletedAt, null);
});
