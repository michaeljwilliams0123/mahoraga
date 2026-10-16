import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY = "michaeljwilliams0123/mahoraga";
const WORKFLOW = ".github/workflows/cloudflare-execution-runtime.yml";
const API = `https://api.github.com/repos/${REPOSITORY}/actions/runs/`;
const MAX_RESPONSE_BYTES = 1_048_576;
type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
const positiveId = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 160 && !/[\x00-\x1f\x7f]/.test(value);
function fail(code: string): never { throw new Error(`executor-observation-${code}`); }

type ObservationInput = {
 runId: number;
 runAttempt: number;
 jobId: number;
 expectedSha: string;
 token: string;
 fetchImpl?: typeof fetch;
 now?: () => number;
};
export type PromotionExecutorObservation = Readonly<{
 schemaVersion: 1;
 kind: "github-promotion-executor-observation";
 evidenceSource: "github-actions-rest";
 repositoryIdentity: typeof REPOSITORY;
 workflowPath: typeof WORKFLOW;
 sourceSha: string;
 runId: number;
 runAttempt: number;
 runStatus: string;
 runConclusion: string | null;
 jobId: number;
 jobName: string;
 jobStatus: string;
 jobConclusion: string | null;
 runner: Readonly<{ id: number; name: string; groupId: number; groupName: string | null; labels: readonly string[] }>;
 collectionStartedAt: string;
 observedAt: string;
 substrateIdentity: "unattested";
 capabilityHealth: "unassessed";
 promotionAuthority: "unassessed";
}>;

async function readJson(response: Response): Promise<JsonRecord> {
 if (response.status !== 200) fail(`http-${response.status}`);
 if (!response.body) fail("response-invalid");
 const reader = response.body.getReader(), chunks: Uint8Array[] = [];
 let size = 0;
 try {
  for (;;) {
   const { done, value } = await reader.read();
   if (done) break;
   size += value.byteLength;
   if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); fail("response-too-large"); }
   chunks.push(value);
  }
 } finally { reader.releaseLock(); }
 let parsed: unknown;
 try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { fail("json-invalid"); }
 const payload = record(parsed);
 if (!payload) fail("json-invalid");
 return payload;
}

function checkRun(value: JsonRecord, input: ObservationInput): void {
 if (value.id !== input.runId || value.run_attempt !== input.runAttempt || value.head_sha !== input.expectedSha || value.head_branch !== "main" || value.path !== WORKFLOW || record(value.repository)?.full_name !== REPOSITORY || record(value.head_repository)?.full_name !== REPOSITORY || !["workflow_run", "workflow_dispatch"].includes(String(value.event)) || !text(value.status) || (value.conclusion !== null && !text(value.conclusion))) fail("run-mismatch");
}

/** A fresh API observation of scheduling metadata, never a substrate attestation or authority decision. */
export async function observePromotionExecutor(input: ObservationInput): Promise<PromotionExecutorObservation> {
 if (!positiveId(input.runId) || !positiveId(input.runAttempt) || !positiveId(input.jobId) || typeof input.expectedSha !== "string" || !/^[a-f0-9]{40}$/.test(input.expectedSha)) fail("input-invalid");
 if (typeof input.token !== "string" || !input.token.trim() || input.token.length > 4096 || /[\x00-\x20\x7f]/.test(input.token)) fail("credentials-invalid");
 const now = input.now ?? Date.now, startedAt = now();
 if (!Number.isFinite(startedAt)) fail("input-invalid");
 const signal = AbortSignal.timeout(10_000);
 const get = async (url: string) => {
  try {
   return await readJson(await (input.fetchImpl ?? fetch)(url, {
    method: "GET", redirect: "error", signal,
    headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "mahoraga-promotion-executor-observer", "Cache-Control": "no-cache", Authorization: `Bearer ${input.token}` },
   }));
  } catch (error) {
   if (error instanceof Error && /^executor-observation-(http-[0-9]{3}|json-invalid|response-invalid|response-too-large)$/.test(error.message)) throw error;
   return fail("transport-unavailable");
  }
 };
 // Bracket the exact-attempt job read with the current run: a rerun cannot lend
 // an earlier attempt's runner identity to the current promotion attempt.
 const before = await get(`${API}${input.runId}`);
 checkRun(before, input);
 const jobs = await get(`${API}${input.runId}/attempts/${input.runAttempt}/jobs?per_page=100`);
 if (!Array.isArray(jobs.jobs) || !Number.isSafeInteger(jobs.total_count) || Number(jobs.total_count) < 0 || Number(jobs.total_count) > 100 || jobs.jobs.length !== jobs.total_count) fail("jobs-invalid");
 const matches = jobs.jobs.map(record).filter(value => value?.id === input.jobId);
 if (matches.length !== 1) fail("job-mismatch");
 const job = matches[0]!;
 if (!job || job.run_id !== input.runId || job.head_sha !== input.expectedSha || job.head_branch !== "main") fail("job-mismatch");
 if (!positiveId(job.runner_id) || !text(job.runner_name) || !Number.isSafeInteger(job.runner_group_id) || Number(job.runner_group_id) < 0 || (job.runner_group_name !== null && !text(job.runner_group_name)) || !text(job.name) || !["in_progress", "completed"].includes(String(job.status)) || (job.conclusion !== null && !text(job.conclusion)) || !Array.isArray(job.labels) || job.labels.length < 1 || job.labels.length > 16 || !job.labels.every(text) || new Set(job.labels).size !== job.labels.length) fail("job-identity-unavailable");
 const after = await get(`${API}${input.runId}`);
 checkRun(after, input);
 if (before.event !== after.event) fail("run-mismatch");
 const observedAt = now();
 if (!Number.isFinite(observedAt) || observedAt < startedAt || observedAt - startedAt > 10_000) fail("collection-expired");
 return Object.freeze({
  schemaVersion: 1, kind: "github-promotion-executor-observation", evidenceSource: "github-actions-rest",
  repositoryIdentity: REPOSITORY, workflowPath: WORKFLOW, sourceSha: input.expectedSha,
  runId: input.runId, runAttempt: input.runAttempt, runStatus: String(after.status), runConclusion: after.conclusion as string | null, jobId: input.jobId,
  jobName: job.name, jobStatus: String(job.status), jobConclusion: job.conclusion as string | null,
  runner: Object.freeze({ id: job.runner_id, name: job.runner_name, groupId: Number(job.runner_group_id), groupName: job.runner_group_name as string | null, labels: Object.freeze([...(job.labels as string[])]) }),
  collectionStartedAt: new Date(startedAt).toISOString(), observedAt: new Date(observedAt).toISOString(),
  substrateIdentity: "unattested", capabilityHealth: "unassessed", promotionAuthority: "unassessed",
 });
}

export async function runPromotionExecutorObservationCli(args: string[], env: NodeJS.ProcessEnv, options: { fetchImpl?: typeof fetch; now?: () => number; write?: (value: string) => void } = {}): Promise<number> {
 const write = options.write ?? (value => process.stdout.write(value));
 try {
  const keys = ["--run-id", "--run-attempt", "--job-id", "--expected-sha"], values = new Map<string, string>();
  if (args.length !== 8) fail("cli-invalid");
  for (let i = 0; i < args.length; i += 2) {
   const key = args[i]!, value = args[i + 1]!;
   if (!keys.includes(key) || values.has(key) || !value || value.startsWith("--")) fail("cli-invalid");
   values.set(key, value);
  }
  const id = (key: string): number => {
   const value = values.get(key) ?? "";
   if (!/^[1-9][0-9]{0,15}$/.test(value) || !positiveId(Number(value))) fail("cli-invalid");
   return Number(value);
  };
  const receipt = await observePromotionExecutor({ runId: id("--run-id"), runAttempt: id("--run-attempt"), jobId: id("--job-id"), expectedSha: values.get("--expected-sha") ?? "", token: env.GH_TOKEN || env.GITHUB_TOKEN || "", ...options });
  write(`${JSON.stringify(receipt, null, 2)}\n`);
  return 0;
 } catch (error) {
  const reason = error instanceof Error && /^executor-observation-[a-z0-9-]{1,80}$/.test(error.message) ? error.message : "executor-observation-unavailable";
  write(`${JSON.stringify({ ok: false, reason })}\n`);
  return 1;
 }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 process.exitCode = await runPromotionExecutorObservationCli(process.argv.slice(2), process.env);
}
