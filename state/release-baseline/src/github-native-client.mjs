const API_ORIGIN = "https://api.github.com";
const API_VERSION = "2026-03-10";
const OWNER = "michaeljwilliams0123";
const REPO = "mahoraga";
const MAX_FILES = 32;
const MAX_BYTES = 512_000;
const PKCS8_BEGIN = `-----BEGIN ${"PRIVATE"} KEY-----`;
const PKCS8_END = `-----END ${"PRIVATE"} KEY-----`;

export function githubAppConfigured(env = process.env) {
  return /^[1-9][0-9]{0,19}$/.test(String(env.GITHUB_APP_ID ?? "").trim())
    && /^[1-9][0-9]{0,19}$/.test(String(env.GITHUB_INSTALLATION_ID ?? "").trim())
    && String(env.GITHUB_APP_PRIVATE_KEY ?? "").trim().startsWith(PKCS8_BEGIN)
    && String(env.GITHUB_APP_PRIVATE_KEY ?? "").trim().endsWith(PKCS8_END);
}

export async function createGithubAppJwt(env = process.env, {
  cryptoImpl = globalThis.crypto,
  now = Date.now,
} = {}) {
  if (!githubAppConfigured(env) || !cryptoImpl?.subtle) fail("github-native-credentials-unavailable", 503);
  const issuedAt = Math.floor(now() / 1000) - 60;
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat: issuedAt, exp: issuedAt + 600, iss: String(env.GITHUB_APP_ID).trim() }));
  const signingInput = `${header}.${payload}`;
  let key;
  try {
    key = await cryptoImpl.subtle.importKey(
      "pkcs8",
      pemBytes(String(env.GITHUB_APP_PRIVATE_KEY)),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch {
    fail("github-native-private-key-invalid", 503);
  }
  const signature = await cryptoImpl.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(new Uint8Array(signature))}`;
}

export async function readMahoragaRepositoryViaGithubApp(_request = {}, options = {}) {
  const token = await mintInstallationToken(options, { contents: "read", metadata: "read" });
  const value = await githubRequest("GET", repoPath(""), null, { ...options, token });
  if (value?.full_name !== `${OWNER}/${REPO}` || value?.default_branch !== "main") fail("github-native-repository-mismatch", 409);
  const mainRef = await githubRequest("GET", repoPath("git/ref/heads/main"), null, { ...options, token });
  const headSha = sha(mainRef?.object?.sha, "github-native-main-readback-invalid");
  const permissions = value?.permissions && typeof value.permissions === "object" ? value.permissions : {};
  return Object.freeze({
    fullName: value.full_name,
    private: value.private === true,
    defaultBranch: "main",
    headSha,
    pushedAt: typeof value?.pushed_at === "string" ? value.pushed_at : null,
    permissions: Object.freeze({
      admin: permissions.admin === true, maintain: permissions.maintain === true,
      push: permissions.push === true, pull: permissions.pull === true, triage: permissions.triage === true,
    }),
  });
}

export async function readMahoragaRepositoryWriteReadinessViaGithubApp(_request = {}, options = {}) {
  const token = await mintInstallationToken(options, { contents: "write", pull_requests: "write", metadata: "read" });
  const value = await githubRequest("GET", repoPath(""), null, { ...options, token });
  if (value?.full_name !== `${OWNER}/${REPO}` || value?.default_branch !== "main") fail("github-native-repository-mismatch", 409);
  const mainRef = await githubRequest("GET", repoPath("git/ref/heads/main"), null, { ...options, token });
  const permissions = value?.permissions && typeof value.permissions === "object" ? value.permissions : {};
  if (permissions.push !== true) fail("github-native-write-permission-unavailable", 403);
  return Object.freeze({
    provider: "github-app", repository: `${OWNER}/${REPO}`, branch: "main",
    headSha: sha(mainRef?.object?.sha, "github-native-main-readback-invalid"),
    permissions: Object.freeze({ contentsWrite: true, pullRequestsWrite: true, metadataRead: true, push: true, admin: permissions.admin === true }),
  });
}

export async function readMahoragaPullRequestChecksViaGithubApp(proposal, options = {}) {
  const normalized = normalizeChecksProposal(proposal);
  const token = await mintInstallationToken(options, { actions: "read", pull_requests: "read", metadata: "read" });
  const request = (method, path, body = null) => githubRequest(method, path, body, { ...options, token });
  const pullRequest = await request("GET", repoPath(`pulls/${normalized.number}`));
  if (pullRequest?.head?.sha !== normalized.expectedHeadSha || pullRequest?.base?.ref !== "main"
    || pullRequest?.head?.repo?.full_name !== `${OWNER}/${REPO}`) fail("github-native-checks-identity-mismatch", 409);
  const runs = await request("GET", repoPath(`actions/runs?head_sha=${normalized.expectedHeadSha}&per_page=20`));
  if (!Array.isArray(runs?.workflow_runs)) fail("github-native-response-invalid", 502);
  const run = runs.workflow_runs.filter((value) => value?.name === "Verify Mahoraga"
    && value?.path === ".github/workflows/verify.yml" && value?.head_sha === normalized.expectedHeadSha
    && (value?.event === "pull_request" || value?.event === "workflow_dispatch"))
    .sort((left, right) => Number(right?.id ?? 0) - Number(left?.id ?? 0))[0] ?? null;
  if (!run) return checksReceipt(normalized, pullRequest, null, []);
  const jobsValue = await request("GET", repoPath(`actions/runs/${positiveInteger(run.id, "github-native-checks-run-invalid")}/jobs?per_page=100`));
  if (!Array.isArray(jobsValue?.jobs)) fail("github-native-response-invalid", 502);
  return checksReceipt(normalized, pullRequest, run, jobsValue.jobs);
}

export async function dispatchMahoragaVerifyWorkflowViaGithubApp(proposal, options = {}) {
  const normalized = normalizeDispatchProposal(proposal);
  const token = await mintInstallationToken(options, { actions: "write", contents: "read", metadata: "read" });
  const request = (method, path, body = null) => githubRequest(method, path, body, { ...options, token });
  const ref = await request("GET", repoPath(`git/ref/heads/${encodeURIComponent(normalized.ref)}`));
  if (sha(ref?.object?.sha, "github-native-dispatch-ref-invalid") !== normalized.expectedHeadSha) fail("github-native-dispatch-stale-head", 409);
  const prior = await findExactDispatch(request, normalized.expectedHeadSha);
  if (prior) return dispatchReceipt(normalized, prior, true);
  await request("POST", repoPath("actions/workflows/verify.yml/dispatches"), { ref: normalized.ref });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = await findExactDispatch(request, normalized.expectedHeadSha);
    if (observed) return dispatchReceipt(normalized, observed, false);
  }
  return dispatchReceipt(normalized, null, false);
}

async function findExactDispatch(request, expectedHeadSha) {
  const value = await request("GET", repoPath(`actions/workflows/verify.yml/runs?event=workflow_dispatch&head_sha=${expectedHeadSha}&per_page=10`));
  if (!Array.isArray(value?.workflow_runs)) fail("github-native-response-invalid", 502);
  return value.workflow_runs.find((run) => run?.head_sha === expectedHeadSha && run?.event === "workflow_dispatch"
    && run?.path === ".github/workflows/verify.yml") ?? null;
}

function checksReceipt(normalized, pullRequest, run, jobs) {
  const requiredNames = ["Verify (ubuntu-latest)", "Verify (windows-latest)"];
  const required = requiredNames.map((name) => {
    const job = jobs.find((candidate) => candidate?.name === name);
    const failedSteps = Array.isArray(job?.steps) ? job.steps.filter((step) => step?.conclusion && step.conclusion !== "success" && step.conclusion !== "skipped")
      .map((step) => String(step.name ?? "unknown").slice(0, 120)).slice(0, 10) : [];
    return Object.freeze({ name, status: job?.status ?? "not_found", conclusion: job?.conclusion ?? null, failedSteps: Object.freeze(failedSteps) });
  });
  const state = !run || required.some((job) => job.status !== "completed") ? "pending"
    : required.every((job) => job.conclusion === "success") && run.conclusion === "success" ? "success" : "failure";
  return Object.freeze({ provider: "github-app", repository: `${OWNER}/${REPO}`, number: normalized.number,
    head: Object.freeze({ ref: pullRequest.head.ref, sha: normalized.expectedHeadSha }), state,
    run: run ? Object.freeze({ id: Number(run.id), event: run.event, status: run.status, conclusion: run.conclusion ?? null, url: run.html_url }) : null,
    required: Object.freeze(required), diagnosis: Object.freeze(required.filter((job) => job.conclusion && job.conclusion !== "success").map((job) => Object.freeze({ job: job.name, conclusion: job.conclusion, failedSteps: job.failedSteps }))) });
}

function dispatchReceipt(normalized, run, adopted) {
  return Object.freeze({ provider: "github-app", repository: `${OWNER}/${REPO}`, workflow: "verify.yml", ref: normalized.ref,
    headSha: normalized.expectedHeadSha, accepted: true, adopted, run: run ? Object.freeze({ id: Number(run.id), status: run.status, conclusion: run.conclusion ?? null, url: run.html_url }) : null });
}

const READABLE_SOURCE_PATHS = new Set([
  "src/repository-chat-intent.mjs",
  "src/github-native-client.mjs",
  "deploy/cloudflare-execution-runtime/worker.ts",
  "deploy/cloudflare-execution-runtime/provider-invoker.ts",
]);
const MAX_SOURCE_FILE_BYTES = 64_000;
const MAX_SOURCE_EXCERPT_CHARS = 4_000;

/** Native GitHub App source read: fixed allowlist, immutable commit and bounded sanitized excerpt. */
export async function readMahoragaSourceFileViaGithubApp(input = {}, options = {}) {
  const path = typeof input?.path === "string" ? input.path.trim() : "";
  if (!READABLE_SOURCE_PATHS.has(path)) fail("github-native-source-path-invalid", 422);
  const token = await mintInstallationToken(options, { contents: "read", metadata: "read" });
  const mainRef = await githubRequest("GET", repoPath("git/ref/heads/main"), null, { ...options, token });
  const headSha = sha(mainRef?.object?.sha, "github-native-main-readback-invalid");
  const file = await githubRequest("GET", repoPath(`contents/${path}?ref=${headSha}`), null, { ...options, token });
  if (file?.type !== "file" || file.path !== path || file.encoding !== "base64" || typeof file.content !== "string"
    || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_SOURCE_FILE_BYTES) {
    fail("github-native-source-response-invalid", 502);
  }
  const blobSha = sha(file.sha, "github-native-source-response-invalid");
  let bytes, source;
  try {
    bytes = base64ToBytes(file.content.replace(/\s/g, ""));
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch { fail("github-native-source-content-invalid", 502); }
  if (bytes.length !== file.size || sensitive(path, source)) fail("github-native-source-content-invalid", 502);
  return Object.freeze({
    repository: `${OWNER}/${REPO}`, branch: "main", headSha, path, blobSha,
    sizeBytes: bytes.length, excerpt: source.slice(0, MAX_SOURCE_EXCERPT_CHARS),
    truncated: source.length > MAX_SOURCE_EXCERPT_CHARS,
    readOnly: true,
  });
}

export async function mergeMahoragaPullRequestViaGithubApp(proposal, options = {}) {
  const normalized = normalizeMergeProposal(proposal);
  const token = await mintInstallationToken(options, { contents: "write", pull_requests: "write", metadata: "read" });
  const request = (method, path, body = null) => githubRequest(method, path, body, { ...options, token });
  const pullRequest = await request("GET", repoPath(`pulls/${normalized.number}`));
  const exactIdentity = pullRequest?.draft === false && pullRequest?.head?.sha === normalized.expectedHeadSha
    && pullRequest?.base?.ref === "main" && pullRequest?.base?.sha === normalized.expectedMainSha;
  if (exactIdentity && pullRequest?.state === "closed" && typeof pullRequest?.merged_at === "string") {
    const mergeSha = sha(pullRequest?.merge_commit_sha, "github-native-merge-response-invalid");
    const finalRef = await request("GET", repoPath("git/ref/heads/main"));
    if (sha(finalRef?.object?.sha, "github-native-main-readback-invalid") !== mergeSha) fail("github-native-main-moved", 409);
    return mergeReceipt(pullRequest, normalized, normalized.expectedMainSha, mergeSha);
  }
  if (pullRequest?.state !== "open" || pullRequest?.draft !== false
    || pullRequest?.head?.sha !== normalized.expectedHeadSha
    || pullRequest?.base?.ref !== "main" || pullRequest?.base?.sha !== normalized.expectedMainSha) {
    fail("github-native-merge-readback-mismatch", 409);
  }
  const baseRef = await request("GET", repoPath("git/ref/heads/main"));
  const baseSha = sha(baseRef?.object?.sha, "github-native-base-response-invalid");
  if (baseSha !== normalized.expectedMainSha) fail("github-native-main-moved", 409);
  const merged = await request("PUT", repoPath(`pulls/${normalized.number}/merge`), {
    sha: normalized.expectedHeadSha,
    merge_method: "squash",
    commit_title: normalized.commitTitle,
  });
  if (merged?.merged !== true) fail("github-native-merge-rejected", 409);
  const mergeSha = sha(merged?.sha, "github-native-merge-response-invalid");
  const finalRef = await request("GET", repoPath("git/ref/heads/main"));
  if (sha(finalRef?.object?.sha, "github-native-main-readback-invalid") !== mergeSha) fail("github-native-main-readback-mismatch", 502);
  return mergeReceipt(pullRequest, normalized, baseSha, mergeSha);
}

function mergeReceipt(pullRequest, normalized, baseSha, mergeSha) {
  return Object.freeze({
    provider: "github-app", repository: `${OWNER}/${REPO}`, number: normalized.number, merged: true, mergeMethod: "squash",
    head: Object.freeze({ ref: pullRequest.head.ref, sha: normalized.expectedHeadSha }),
    base: Object.freeze({ ref: "main", sha: baseSha }), main: Object.freeze({ ref: "main", sha: mergeSha }),
  });
}

export async function createMahoragaDirectMainCommitViaGithubApp(proposal, options = {}) {
  const normalized = normalizeDirectMainProposal(proposal);
  const token = await mintInstallationToken(options, { contents: "write", metadata: "read" });
  const request = (method, path, body = null) => githubRequest(method, path, body, { ...options, token });
  const baseRef = await request("GET", repoPath("git/ref/heads/main"));
  const baseSha = sha(baseRef?.object?.sha, "github-native-base-response-invalid");
  if (baseSha !== normalized.expectedMainSha) fail("github-native-main-moved", 409);
  const baseCommit = await request("GET", repoPath(`git/commits/${baseSha}`));
  const entries = [];
  for (const file of normalized.files) {
    if (file.delete === true) {
      entries.push({ path: file.path, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const blob = await request("POST", repoPath("git/blobs"), { content: bytesToBase64(new TextEncoder().encode(file.content)), encoding: "base64" });
    entries.push({ path: file.path, mode: "100644", type: "blob", sha: sha(blob?.sha, "github-native-write-response-invalid") });
  }
  const tree = await request("POST", repoPath("git/trees"), { base_tree: sha(baseCommit?.tree?.sha, "github-native-base-response-invalid"), tree: entries });
  const commit = await request("POST", repoPath("git/commits"), {
    message: normalized.commitMessage, tree: sha(tree?.sha, "github-native-write-response-invalid"), parents: [baseSha],
  });
  const commitSha = sha(commit?.sha, "github-native-write-response-invalid");
  await request("PATCH", repoPath("git/refs/heads/main"), { sha: commitSha, force: false });
  const finalRef = await request("GET", repoPath("git/ref/heads/main"));
  if (sha(finalRef?.object?.sha, "github-native-main-readback-invalid") !== commitSha) fail("github-native-main-readback-mismatch", 502);
  return Object.freeze({
    provider: "github-app", repository: `${OWNER}/${REPO}`, directMain: true,
    previous: Object.freeze({ ref: "main", sha: baseSha }), main: Object.freeze({ ref: "main", sha: commitSha }),
  });
}

export async function createMahoragaPullRequestViaGithubApp(proposal, options = {}) {
  const normalized = normalizeProposal(proposal);
  const token = await mintInstallationToken(options, { contents: "write", pull_requests: "write", metadata: "read" });
  const request = (method, path, body = null) => githubRequest(method, path, body, { ...options, token });
  const existing = await request("GET", repoPath(`pulls?state=all&head=${encodeURIComponent(`${OWNER}:${normalized.branch}`)}`));
  if (!Array.isArray(existing)) fail("github-native-response-invalid", 502);
  const exactExisting = existing.filter((value) => exactPullRequest(value, normalized, value?.head?.sha, normalized.expectedMainSha));
  if (exactExisting.length === 1 && existing.length === 1) return projectPullRequest(exactExisting[0], normalized, exactExisting[0].head.sha, normalized.expectedMainSha);
  if (existing.length > 0) fail("github-native-existing-pr-conflict", 409);

  const baseRef = await request("GET", repoPath("git/ref/heads/main"));
  const baseSha = sha(baseRef?.object?.sha, "github-native-base-response-invalid");
  if (baseSha !== normalized.expectedMainSha) fail("github-native-main-moved", 409);
  const baseCommit = await request("GET", repoPath(`git/commits/${baseSha}`));
  const baseTree = sha(baseCommit?.tree?.sha, "github-native-base-response-invalid");
  const entries = [];
  for (const file of normalized.files) {
    if (file.delete === true) {
      entries.push({ path: file.path, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const blob = await request("POST", repoPath("git/blobs"), { content: bytesToBase64(new TextEncoder().encode(file.content)), encoding: "base64" });
    entries.push({ path: file.path, mode: "100644", type: "blob", sha: sha(blob?.sha, "github-native-write-response-invalid") });
  }
  const tree = await request("POST", repoPath("git/trees"), { base_tree: baseTree, tree: entries });
  const commit = await request("POST", repoPath("git/commits"), { message: normalized.commitMessage, tree: sha(tree?.sha, "github-native-write-response-invalid"), parents: [baseSha] });
  const commitSha = sha(commit?.sha, "github-native-write-response-invalid");
  let branchCreated = false;
  let createdNumber = null;
  try {
    await request("POST", repoPath("git/refs"), { ref: `refs/heads/${normalized.branch}`, sha: commitSha });
    branchCreated = true;
    const created = await request("POST", repoPath("pulls"), { title: normalized.title, body: normalized.body, head: normalized.branch, base: "main", draft: true });
    createdNumber = positiveInteger(created?.number, "github-native-write-response-invalid");
    const pullRequest = await request("GET", repoPath(`pulls/${createdNumber}`));
    const receipt = projectPullRequest(pullRequest, normalized, commitSha, baseSha);
    if (receipt.state !== "open") fail("github-native-readback-mismatch", 502);
    return receipt;
  } catch (error) {
    if (createdNumber !== null) await compensate(request, createdNumber, normalized.branch, branchCreated);
    throw error;
  }
}

async function compensate(request, number, branch, branchCreated) {
  try {
    await request("PATCH", repoPath(`pulls/${number}`), { state: "closed" });
    if (branchCreated) await request("DELETE", repoPath(`git/refs/heads/${encodeURIComponent(branch)}`));
  } catch {
    fail("github-native-compensation-failed", 502);
  }
}


const REPOSITORY_MUTATIONS = new Set(["pr-update", "issue-create", "issue-update", "comment-create", "comment-delete", "branch-delete"]);

/** Bounded work-item and branch mutations for the fixed Mahoraga repository. */
export async function mutateMahoragaRepositoryViaGithubApp(action, proposal, options = {}) {
  const normalized = normalizeRepositoryMutation(action, proposal);
  const permissions = normalized.permission === "issues"
    ? { issues: "write", metadata: "read" }
    : normalized.permission === "pull_requests"
      ? { pull_requests: "write", metadata: "read" }
      : { contents: "write", metadata: "read" };
  const token = await mintInstallationToken(options, permissions);
  const request = (method, path, body = null) => githubRequest(method, path, body, { ...options, token });

  if (action === "issue-create") {
    const created = await request("POST", repoPath("issues"), normalized.update);
    return projectWorkItem(created, "issue", normalized);
  }
  if (action === "issue-update" || action === "pr-update") {
    const kind = action === "issue-update" ? "issue" : "pull-request";
    const path = kind === "issue" ? `issues/${normalized.number}` : `pulls/${normalized.number}`;
    const current = await request("GET", repoPath(path));
    assertWorkItem(current, kind, normalized.number);
    if (kind === "pull-request") {
      if (current?.head?.repo?.full_name !== `${OWNER}/${REPO}` || current?.head?.sha !== normalized.expectedHeadSha
        || current?.base?.ref !== "main") fail("github-native-pr-update-identity-mismatch", 409);
    }
    const updated = await request("PATCH", repoPath(path), normalized.update);
    return projectWorkItem(updated, kind, normalized);
  }
  if (action === "comment-create" || action === "comment-delete") {
    const path = normalized.kind === "issue" ? `issues/${normalized.number}` : `pulls/${normalized.number}`;
    assertWorkItem(await request("GET", repoPath(path)), normalized.kind, normalized.number);
    const issueUrl = `${API_ORIGIN}${repoPath(`issues/${normalized.number}`)}`;
    if (action === "comment-create") {
      const created = await request("POST", repoPath(`issues/${normalized.number}/comments`), { body: normalized.body });
      if (!Number.isSafeInteger(Number(created?.id)) || Number(created.id) < 1 || created?.issue_url !== issueUrl
        || created?.body !== normalized.body) fail("github-native-comment-readback-mismatch", 502);
      return Object.freeze({ provider: "github-app", repository: `${OWNER}/${REPO}`, action,
        kind: normalized.kind, number: normalized.number, commentId: Number(created.id), url: String(created.html_url ?? "") });
    }
    const existing = await request("GET", repoPath(`issues/comments/${normalized.commentId}`));
    if (Number(existing?.id) !== normalized.commentId || existing?.issue_url !== issueUrl) fail("github-native-comment-identity-mismatch", 409);
    await request("DELETE", repoPath(`issues/comments/${normalized.commentId}`));
    return Object.freeze({ provider: "github-app", repository: `${OWNER}/${REPO}`, action,
      kind: normalized.kind, number: normalized.number, commentId: normalized.commentId, deleted: true });
  }

  const refPath = `git/ref/heads/${encodeURIComponent(normalized.branch)}`;
  const current = await request("GET", repoPath(refPath));
  if (sha(current?.object?.sha, "github-native-branch-readback-invalid") !== normalized.expectedHeadSha) fail("github-native-branch-moved", 409);
  await request("DELETE", repoPath(`git/refs/heads/${encodeURIComponent(normalized.branch)}`));
  return Object.freeze({ provider: "github-app", repository: `${OWNER}/${REPO}`, action,
    branch: normalized.branch, deletedHeadSha: normalized.expectedHeadSha, deleted: true });
}

function normalizeRepositoryMutation(action, value) {
  if (!REPOSITORY_MUTATIONS.has(action) || !value || typeof value !== "object" || Array.isArray(value)) fail("github-native-mutation-invalid", 422);
  const keys = Object.keys(value);
  const exact = (allowed, required = []) => {
    if (keys.some((key) => !allowed.includes(key)) || required.some((key) => !Object.hasOwn(value, key))) fail("github-native-mutation-invalid", 422);
  };
  const optionalBody = () => {
    if (value.body === undefined) return undefined;
    if (typeof value.body !== "string" || value.body.length > 20_000) fail("github-native-mutation-body-invalid", 422);
    return value.body;
  };
  const state = () => {
    if (value.state === undefined) return undefined;
    if (value.state !== "open" && value.state !== "closed") fail("github-native-mutation-state-invalid", 422);
    return value.state;
  };
  if (action === "issue-create") {
    exact(["title", "body"], ["title"]);
    return Object.freeze({ permission: "issues", title: bounded(value.title, 1, 200, "github-native-mutation-title-invalid"),
      update: Object.freeze({ title: value.title, ...(value.body === undefined ? {} : { body: optionalBody() }) }) });
  }
  if (action === "issue-update" || action === "pr-update") {
    const allowed = action === "pr-update" ? ["number", "expectedHeadSha", "title", "body", "state"] : ["number", "title", "body", "state"];
    const required = action === "pr-update" ? ["number", "expectedHeadSha"] : ["number"];
    exact(allowed, required);
    const update = {};
    if (value.title !== undefined) update.title = bounded(value.title, 1, 200, "github-native-mutation-title-invalid");
    if (value.body !== undefined) update.body = optionalBody();
    if (value.state !== undefined) update.state = state();
    if (Object.keys(update).length === 0) fail("github-native-mutation-empty", 422);
    return Object.freeze({ permission: action === "pr-update" ? "pull_requests" : "issues",
      number: positiveInteger(value.number, "github-native-mutation-number-invalid"),
      ...(action === "pr-update" ? { expectedHeadSha: sha(value.expectedHeadSha, "github-native-mutation-head-invalid") } : {}),
      update: Object.freeze(update) });
  }
  if (action === "comment-create" || action === "comment-delete") {
    const allowed = action === "comment-create" ? ["kind", "number", "body"] : ["kind", "number", "commentId"];
    exact(allowed, allowed);
    if (value.kind !== "issue" && value.kind !== "pull-request") fail("github-native-comment-kind-invalid", 422);
    return Object.freeze({ permission: value.kind === "issue" ? "issues" : "pull_requests", kind: value.kind,
      number: positiveInteger(value.number, "github-native-mutation-number-invalid"),
      ...(action === "comment-create"
        ? { body: bounded(value.body, 1, 20_000, "github-native-mutation-body-invalid") }
        : { commentId: positiveInteger(value.commentId, "github-native-comment-id-invalid") }) });
  }
  exact(["branch", "expectedHeadSha"], ["branch", "expectedHeadSha"]);
  const branch = String(value.branch ?? "").trim();
  if (!/^mahoraga\/[a-z0-9][a-z0-9._/-]{2,79}$/.test(branch) || branch.includes("..") || branch.endsWith("/")) fail("github-native-branch-invalid", 422);
  return Object.freeze({ permission: "contents", branch, expectedHeadSha: sha(value.expectedHeadSha, "github-native-mutation-head-invalid") });
}

function assertWorkItem(value, kind, expectedNumber) {
  const number = positiveInteger(value?.number, "github-native-work-item-invalid");
  const suffix = kind === "issue" ? `issues/${number}` : `pull/${number}`;
  if (number !== expectedNumber || String(value?.html_url ?? "") !== `https://github.com/${OWNER}/${REPO}/${suffix}`
    || (kind === "issue" ? Object.hasOwn(value ?? {}, "pull_request") : !Object.hasOwn(value ?? {}, "head"))) {
    fail("github-native-work-item-identity-mismatch", 409);
  }
}
function projectWorkItem(value, kind, normalized) {
  assertWorkItem(value, kind, normalized.number ?? positiveInteger(value?.number, "github-native-work-item-invalid"));
  return Object.freeze({ provider: "github-app", repository: `${OWNER}/${REPO}`,
    action: kind === "issue" && normalized.number === undefined ? "issue-create" : kind === "issue" ? "issue-update" : "pr-update",
    kind, number: Number(value.number), url: String(value.html_url), state: value.state === "open" || value.state === "closed" ? value.state : "unknown",
    title: typeof value.title === "string" ? value.title.slice(0, 200) : "" });
}

async function mintInstallationToken({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {}, permissions) {
  const jwt = await createGithubAppJwt(env);
  const installationId = String(env.GITHUB_INSTALLATION_ID).trim();
  const value = await rawRequest("POST", `/app/installations/${installationId}/access_tokens`, {
    repositories: [REPO], permissions,
  }, { authorization: `Bearer ${jwt}`, fetchImpl, timeoutMs });
  const token = String(value?.token ?? "").trim();
  if (!token || typeof value?.expires_at !== "string") fail("github-native-token-response-invalid", 502);
  return token;
}

async function githubRequest(method, path, body, { token, fetchImpl = globalThis.fetch, timeoutMs = 15_000 }) {
  if (!token) fail("github-native-token-unavailable", 503);
  return rawRequest(method, path, body, { authorization: `Bearer ${token}`, fetchImpl, timeoutMs });
}

async function rawRequest(method, path, body, { authorization, fetchImpl, timeoutMs }) {
  if (typeof fetchImpl !== "function") fail("github-native-fetch-unavailable", 503);
  let response;
  try {
    response = await fetchImpl(`${API_ORIGIN}${path}`, {
      method,
      headers: { accept: "application/vnd.github+json", authorization, "content-type": "application/json", "user-agent": "mahoraga-cloudflare-worker", "x-github-api-version": API_VERSION },
      ...(body === null ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") fail("github-native-request-timeout", 504);
    fail("github-native-request-unreachable", 503);
  }
  const value = response.status === 204 ? {} : await response.json().catch(() => null);
  if (!response.ok) fail(`github-native-http-${response.status}`, response.status >= 400 && response.status < 600 ? response.status : 502);
  if (value === null) fail("github-native-response-invalid", 502);
  return value;
}

function normalizeProposal(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("github-native-proposal-invalid", 422);
  const expectedMainSha = sha(value.expectedMainSha, "github-native-proposal-base-invalid");
  const branch = String(value.branch ?? "").trim();
  if (!/^mahoraga\/[a-z0-9][a-z0-9._-]{2,79}$/.test(branch)) fail("github-native-proposal-branch-invalid", 422);
  const title = bounded(value.title, 1, 200, "github-native-proposal-title-invalid");
  const body = bounded(value.body, 1, 20_000, "github-native-proposal-body-invalid");
  const commitMessage = bounded(value.commitMessage, 1, 200, "github-native-proposal-commit-invalid");
  if (!Array.isArray(value.files) || value.files.length < 1 || value.files.length > MAX_FILES) fail("github-native-proposal-files-invalid", 422);
  let bytes = 0;
  const seen = new Set();
  const files = value.files.map((file) => {
    if (!file || typeof file !== "object" || Array.isArray(file)) fail("github-native-proposal-file-invalid", 422);
    const path = String(file.path ?? "").trim().replaceAll("\\", "/");
    if (!path || path.length > 240 || path.startsWith("/") || path.split("/").some((part) => !part || part === "." || part === "..") || path === ".git" || path.startsWith(".git/")) fail("github-native-proposal-path-invalid", 422);
    if (seen.has(path)) fail("github-native-proposal-path-duplicate", 422);
    seen.add(path);
    if (file.delete === true) {
      if (Object.hasOwn(file, "content") || Object.keys(file).some((key) => key !== "path" && key !== "delete")) fail("github-native-proposal-file-invalid", 422);
      return Object.freeze({ path, delete: true });
    }
    if (Object.hasOwn(file, "delete") || typeof file.content !== "string"
      || Object.keys(file).some((key) => key !== "path" && key !== "content")) fail("github-native-proposal-content-invalid", 422);
    if (sensitive(path, file.content)) fail("github-native-proposal-sensitive", 422);
    bytes += new TextEncoder().encode(file.content).byteLength;
    return Object.freeze({ path, content: file.content, delete: false });
  });
  if (bytes > MAX_BYTES) fail("github-native-proposal-content-too-large", 413);
  return Object.freeze({ expectedMainSha, branch, title, body, commitMessage, files: Object.freeze(files) });
}

function normalizeMergeProposal(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("github-native-merge-proposal-invalid", 422);
  return Object.freeze({
    number: positiveInteger(value.number, "github-native-merge-number-invalid"),
    expectedMainSha: sha(value.expectedMainSha, "github-native-proposal-base-invalid"),
    expectedHeadSha: sha(value.expectedHeadSha, "github-native-merge-head-invalid"),
    commitTitle: bounded(value.commitTitle, 1, 200, "github-native-merge-title-invalid"),
  });
}

function normalizeChecksProposal(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("github-native-checks-proposal-invalid", 422);
  return Object.freeze({ number: positiveInteger(value.number, "github-native-checks-number-invalid"), expectedHeadSha: sha(value.expectedHeadSha, "github-native-checks-head-invalid") });
}

function normalizeDispatchProposal(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("github-native-dispatch-proposal-invalid", 422);
  const ref = String(value.ref ?? "").trim();
  if (!/^mahoraga\/[a-z0-9][a-z0-9._-]{2,79}$/.test(ref)) fail("github-native-dispatch-ref-invalid", 422);
  return Object.freeze({ ref, expectedHeadSha: sha(value.expectedHeadSha, "github-native-dispatch-head-invalid") });
}

function normalizeDirectMainProposal(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("github-native-direct-main-proposal-invalid", 422);
  const normalized = normalizeProposal({
    ...value,
    branch: "mahoraga/direct-main-validation",
    title: "Direct main validation",
    body: "Direct main validation",
  });
  return Object.freeze({ expectedMainSha: normalized.expectedMainSha, commitMessage: normalized.commitMessage, files: normalized.files });
}

function sensitive(path, content) {
  const base = path.toLowerCase().split("/").at(-1);
  if (base === ".env" || base.startsWith(".env.") || /\.(?:pem|key|p12|pfx)$/.test(base)) return true;
  return new RegExp(`-----BEGIN (?:RSA |EC |OPENSSH )?${"PRIVATE"} KEY-----`).test(content)
    || /\bgithub_pat_[A-Za-z0-9_]{40,}\b/.test(content)
    || /\bgh[opusr]_[A-Za-z0-9]{30,}\b/.test(content);
}

function projectPullRequest(value, proposal, commitSha, baseSha) {
  if (!exactPullRequest(value, proposal, commitSha, baseSha)) fail("github-native-readback-mismatch", 502);
  return Object.freeze({ provider: "github-app", repository: `${OWNER}/${REPO}`, number: Number(value.number), url: value.html_url,
    state: value.state === "open" ? "open" : "unknown", draft: true,
    head: Object.freeze({ ref: proposal.branch, sha: commitSha }), base: Object.freeze({ ref: "main", sha: baseSha }) });
}

function exactPullRequest(value, proposal, commitSha, baseSha) {
  return Number.isSafeInteger(Number(value?.number)) && Number(value.number) > 0
    && /^https:\/\/github\.com\/michaeljwilliams0123\/mahoraga\/pull\/[1-9][0-9]*$/.test(String(value?.html_url ?? ""))
    && value?.state === "open" && value?.draft === true && value?.head?.ref === proposal.branch && value?.head?.sha === commitSha
    && value?.base?.ref === "main" && value?.base?.sha === baseSha;
}

function repoPath(suffix) { return `/repos/${OWNER}/${REPO}${suffix ? `/${suffix}` : ""}`; }
function sha(value, code) { const result = String(value ?? "").trim().toLowerCase(); if (!/^[a-f0-9]{40}$/.test(result)) fail(code, 422); return result; }
function bounded(value, min, max, code) { const result = String(value ?? "").trim(); if (result.length < min || result.length > max) fail(code, 422); return result; }
function positiveInteger(value, code) { const result = Number(value); if (!Number.isSafeInteger(result) || result < 1) fail(code, 502); return result; }
function pemBytes(value) { return base64ToBytes(value.replace(PKCS8_BEGIN, "").replace(PKCS8_END, "").replace(/\s/g, "")); }
function base64url(value) { const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value; return bytesToBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""); }
function bytesToBase64(bytes) { let binary = ""; for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]); return btoa(binary); }
function base64ToBytes(value) { const binary = atob(value); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
function fail(code, status) { const error = new TypeError(code); error.code = code; error.status = status; throw error; }
