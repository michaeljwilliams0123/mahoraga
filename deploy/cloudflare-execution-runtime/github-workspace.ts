// @ts-expect-error Reuse the canonical runtime-neutral GitHub App signer.
import { createGithubAppJwt } from "../../src/github-native-client.mjs";
import type { GithubReadState, GithubWorkflowRun, GithubWorkspaceSnapshot } from "../../cloud-app/lib/github-workspace-types.ts";

const API = "https://api.github.com";
const REPOSITORY = "michaeljwilliams0123/mahoraga" as const;
const REPO_PATH = `/repos/${REPOSITORY}`;
const SITE_URL = "https://michaeljwilliams0123.github.io/mahoraga/";
type Options = { env: { GITHUB_APP_ID?: unknown; GITHUB_INSTALLATION_ID?: unknown; GITHUB_APP_PRIVATE_KEY?: unknown }; fetchImpl?: typeof fetch };
type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
const text = (value: unknown, max = 160): string | null => typeof value === "string" && value.length > 0 && value.length <= max ? value : null;
const id = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
function fail(code: string, status = 502): never { throw Object.assign(new Error(code), { code, status }); }
function reason(error: unknown) {
  const code = record(error)?.code;
  return typeof code === "string" && /^github-native-[a-z0-9-]{1,64}$/.test(code) ? code : "github-native-workspace-unavailable";
}
const stateFor = (code: string): GithubReadState => /http-(401|403)$/.test(code) ? "denied" : "unavailable";

async function request(path: string, authorization: string, options: Options, body?: JsonRecord): Promise<JsonRecord> {
  const response = await (options.fetchImpl ?? fetch)(`${API}${path}`, {
    method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(12_000),
    headers: { accept: "application/vnd.github+json", authorization, "content-type": "application/json", "user-agent": "mahoraga-workspace-inspection", "x-github-api-version": "2026-03-10" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).catch(() => fail("github-native-workspace-request-unreachable", 503));
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    fail(`github-native-http-${response.status}`, response.status);
  }
  const reader = response.body?.getReader();
  if (!reader) fail("github-native-workspace-response-invalid");
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 256 * 1024) { await reader.cancel(); fail("github-native-workspace-response-too-large"); }
      chunks.push(chunk.value);
    }
  } catch (error) { if (record(error)?.code) throw error; fail("github-native-workspace-response-unavailable"); }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(joined)); } catch { fail("github-native-workspace-response-invalid"); }
  const result = record(value);
  if (!result) fail("github-native-workspace-response-invalid");
  return result;
}

async function token(permission: "pages" | "actions" | "issues", options: Options): Promise<string> {
  const jwt = await createGithubAppJwt(options.env);
  const installationId = String(options.env.GITHUB_INSTALLATION_ID ?? "").trim();
  const result = await request(`/app/installations/${installationId}/access_tokens`, `Bearer ${jwt}`, options, { repositories: ["mahoraga"], permissions: { [permission === "issues" ? "pull_requests" : permission]: permission === "issues" ? "write" : "read", metadata: "read" } });
  if (typeof result.token !== "string" || !result.token || typeof result.expires_at !== "string") fail("github-native-token-response-invalid");
  return result.token;
}

async function pages(options: Options): Promise<GithubWorkspaceSnapshot["pages"]> {
  try {
    const value = await request(`${REPO_PATH}/pages`, `Bearer ${await token("pages", options)}`, options);
    if (!text(value.status)) fail("github-native-workspace-pages-response-invalid");
    return { state: "available", url: value.html_url === SITE_URL || value.html_url === SITE_URL.slice(0, -1) ? SITE_URL : null, status: text(value.status), buildType: text(value.build_type), reason: null };
  } catch (error) { const code = reason(error); return { state: stateFor(code), url: null, status: null, buildType: null, reason: code }; }
}

function projectRun(value: unknown): GithubWorkflowRun | null {
  const run = record(value);
  const runId = id(run?.id);
  if (!run || runId === null || !text(run.name) || !text(run.status)) return null;
  return { id: runId, name: text(run.name)!, status: text(run.status)!, conclusion: text(run.conclusion), sha: typeof run.head_sha === "string" && /^[a-f0-9]{40}$/.test(run.head_sha) ? run.head_sha : null, branch: text(run.head_branch), url: `https://github.com/${REPOSITORY}/actions/runs/${runId}`, updatedAt: text(run.updated_at) };
}

async function actions(options: Options): Promise<GithubWorkspaceSnapshot["actions"]> {
  const empty = { runs: [], failedRunId: null, failedJobs: [], failureDetailsReason: null };
  try {
    const authorization = `Bearer ${await token("actions", options)}`;
    const value = await request(`${REPO_PATH}/actions/runs?per_page=10`, authorization, options);
    if (!Array.isArray(value.workflow_runs)) fail("github-native-workspace-actions-response-invalid");
    const runs = value.workflow_runs.slice(0, 10).map(projectRun).filter((run): run is GithubWorkflowRun => run !== null);
    const failed = runs.find(run => run.conclusion === "failure" || run.conclusion === "timed_out");
    const result: GithubWorkspaceSnapshot["actions"] = { state: "available", runs, failedRunId: failed?.id ?? null, failedJobs: [], reason: null, failureDetailsReason: null };
    if (failed) {
      try {
        const jobs = await request(`${REPO_PATH}/actions/runs/${failed.id}/jobs?per_page=20`, authorization, options);
        if (!Array.isArray(jobs.jobs)) fail("github-native-workspace-jobs-response-invalid");
        result.failedJobs = jobs.jobs.slice(0, 20).map(record).filter(job => job && (job.conclusion === "failure" || job.conclusion === "timed_out")).slice(0, 5).map(job => ({ name: text(job!.name) ?? "Unnamed job", steps: Array.isArray(job!.steps) ? job!.steps.map(record).filter(step => step?.conclusion === "failure").slice(0, 5).map(step => text(step!.name) ?? "Unnamed step") : [] }));
      } catch (error) { result.failureDetailsReason = reason(error); }
    }
    return result;
  } catch (error) { const code = reason(error); return { ...empty, state: stateFor(code), reason: code }; }
}

export async function inspectGithubWorkspace(payload: Record<string, unknown>, options: Options): Promise<GithubWorkspaceSnapshot> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).length) fail("github-native-workspace-request-invalid", 400);
  const [pagesResult, actionsResult] = await Promise.all([pages(options), actions(options)]);
  return { repository: REPOSITORY, observedAt: new Date().toISOString(), readOnly: true, pages: pagesResult, actions: actionsResult };
}

/** Evidence-only observer. Does not activate inference, dispatch workflows, or mutate protected source. */
export async function inspectNativeSourceProduction(sourceSha: string, runtimeSha: string, options: Options) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha) || !/^[a-f0-9]{40}$/.test(runtimeSha)) fail("native-source-invalid", 409);
  const authorization = `Bearer ${await token("actions", options)}`;
  const readRuns = async (workflow: string) => {
    const value = await request(`${REPO_PATH}/actions/workflows/${workflow}/runs?branch=main&per_page=10`, authorization, options);
    if (!Array.isArray(value.workflow_runs)) fail("native-workflow-runs-invalid");
    return value.workflow_runs.map(record).filter((run): run is JsonRecord => run !== null)
      .filter(run => run.head_sha === sourceSha && run.head_branch === "main"
        && run.conclusion === "success" && run.status === "completed"
        && (run.event === "push" || run.event === "workflow_dispatch" || run.event === "workflow_run"))
      .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
  };
  const [verification, acceptance] = await Promise.all([
    readRuns("verify.yml"), readRuns("cloudflare-execution-runtime.yml"),
  ]);
  const verifyRunId = id(verification[0]?.id);
  const acceptanceRunId = id(acceptance[0]?.id);
  let ubuntuPassed = false, windowsPassed = false;
  if (verifyRunId !== null) {
    const jobs = await request(`${REPO_PATH}/actions/runs/${verifyRunId}/jobs?per_page=100`, authorization, options);
    if (!Array.isArray(jobs.jobs)) fail("native-verification-jobs-invalid");
    const rows = jobs.jobs.map(record).filter((job): job is JsonRecord => job !== null);
    ubuntuPassed = rows.some(job => job.name === "Verify (ubuntu-latest)" && job.conclusion === "success");
    windowsPassed = rows.some(job => job.name === "Verify (windows-latest)" && job.conclusion === "success");
  }
  let acceptancePassed = false;
  if (acceptanceRunId !== null) {
    const jobs = await request(`${REPO_PATH}/actions/runs/${acceptanceRunId}/jobs?per_page=100`, authorization, options);
    if (!Array.isArray(jobs.jobs)) fail("native-acceptance-jobs-invalid");
    const rows = jobs.jobs.map(record).filter((job): job is JsonRecord => job !== null);
    acceptancePassed = rows.some(job => job.name === "Deploy and accept exact verified main" && job.conclusion === "success")
      && rows.some(job => typeof job.name === "string" && job.name.startsWith("Publish the paired Cloudflare cockpit")
        && job.conclusion === "success");
  }
  return { sourceSha, runtimeSha, verifyRunId, ubuntuPassed, windowsPassed,
    acceptanceRunId, acceptancePassed };
}

const EVIDENCE_ISSUE = 786;
export async function publishNativeSourceProductionEvidence(
  fingerprint: string, body: string, options: Options,
): Promise<{ alreadyPresent: boolean; id: number }> {
  if (!/^[a-f0-9]{64}$/.test(fingerprint) || body.length < 20 || body.length > 4000) fail("native-evidence-invalid", 400);
  const authorization = `Bearer ${await token("issues", options)}`;
  const issue = await request(`${REPO_PATH}/issues/${EVIDENCE_ISSUE}`, authorization, options);
  if (id(issue.number) !== EVIDENCE_ISSUE || issue.state !== "open") fail("native-evidence-issue-unavailable", 409);
  const count = typeof issue.comments === "number" && Number.isSafeInteger(issue.comments) ? issue.comments : null;
  if (count === null || count < 0 || count > 20000) fail("native-evidence-comments-unbounded", 409);
  const mark = `<!-- mahoraga-native-evidence:${fingerprint} -->`;
  const perPage = 100;
  const firstPage = Math.max(1, Math.ceil(count / perPage));
  // Inspect the tail before posting; a timed-out prior POST may already have succeeded.
  for (const page of [firstPage, ...(firstPage > 1 ? [firstPage - 1] : [])]) {
    const response = await (options.fetchImpl ?? fetch)(`${API}${REPO_PATH}/issues/${EVIDENCE_ISSUE}/comments?per_page=${perPage}&page=${page}`, {
      method: "GET", redirect: "error", signal: AbortSignal.timeout(12_000),
      headers: { accept: "application/vnd.github+json", authorization,
        "user-agent": "mahoraga-native-evidence", "x-github-api-version": "2026-03-10" },
    }).catch(() => fail("native-evidence-read-unreachable", 503));
    if (!response.ok) { await response.body?.cancel().catch(() => {}); fail("native-evidence-read-failed", response.status); }
    const value: unknown = await response.json().catch(() => null);
    if (!Array.isArray(value) || value.length > 100) fail("native-evidence-comments-invalid", 502);
    for (const item of value) {
      const comment = record(item);
      if (typeof comment?.body === "string" && comment.body.includes(mark) && id(comment.id) !== null) {
        return { alreadyPresent: true, id: id(comment.id)! };
      }
    }
  }
  const posted = await request(`${REPO_PATH}/issues/${EVIDENCE_ISSUE}/comments`, authorization, options, { body: `${body}\n\n${mark}` });
  const createdId = id(posted.id);
  if (createdId === null) fail("native-evidence-publish-unconfirmed", 502);
  return { alreadyPresent: false, id: createdId };
}
