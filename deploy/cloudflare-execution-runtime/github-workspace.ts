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

async function token(permission: "pages" | "actions", options: Options): Promise<string> {
  const jwt = await createGithubAppJwt(options.env);
  const installationId = String(options.env.GITHUB_INSTALLATION_ID ?? "").trim();
  const result = await request(`/app/installations/${installationId}/access_tokens`, `Bearer ${jwt}`, options, { repositories: ["mahoraga"], permissions: { [permission]: "read", metadata: "read" } });
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
