const DEFAULT_BASE_URL = "https://backend.composio.dev/api/v3.1";
const GITHUB_REPOSITORY_TOOL = "GITHUB_GET_A_REPOSITORY";
const MAHORAGA_OWNER = "michaeljwilliams0123";
const MAHORAGA_REPO = "mahoraga";
const MAX_PROPOSAL_FILES = 32;
const MAX_PROPOSAL_BYTES = 512_000;

export function composioConfigured(env = process.env) {
  return typeof env.COMPOSIO_API_KEY === "string" && env.COMPOSIO_API_KEY.trim().length > 0;
}

export async function readGithubRepositoryViaComposio({ owner, repo }, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
} = {}) {
  const normalizedOwner = githubToken(owner, "composio-github-owner-invalid");
  const normalizedRepo = githubToken(repo, "composio-github-repo-invalid");
  const data = await executeComposioTool(GITHUB_REPOSITORY_TOOL, { owner: normalizedOwner, repo: normalizedRepo }, { env, fetchImpl, timeoutMs });
  return projectRepository(data);
}

export async function createMahoragaPullRequestViaComposio(proposal, options = {}) {
  const normalized = normalizePullRequestProposal(proposal);
  const baseRef = await executeComposioProxy("GET", githubEndpoint("git/ref/heads/main"), null, options);
  const observedMainSha = githubSha(baseRef?.object?.sha, "composio-github-base-response-invalid");
  if (observedMainSha !== normalized.expectedMainSha) fail("composio-github-main-moved", 409);

  const baseCommit = await executeComposioProxy("GET", githubEndpoint(`git/commits/${observedMainSha}`), null, options);
  const baseTreeSha = githubSha(baseCommit?.tree?.sha, "composio-github-base-response-invalid");
  const treeEntries = [];
  for (const file of normalized.files) {
    const blob = await executeComposioProxy("POST", githubEndpoint("git/blobs"), {
      content: Buffer.from(file.content, "utf8").toString("base64"),
      encoding: "base64",
    }, options);
    treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: githubSha(blob?.sha, "composio-github-write-response-invalid") });
  }
  const tree = await executeComposioProxy("POST", githubEndpoint("git/trees"), { base_tree: baseTreeSha, tree: treeEntries }, options);
  const commit = await executeComposioProxy("POST", githubEndpoint("git/commits"), {
    message: normalized.commitMessage,
    tree: githubSha(tree?.sha, "composio-github-write-response-invalid"),
    parents: [observedMainSha],
  }, options);
  const commitSha = githubSha(commit?.sha, "composio-github-write-response-invalid");
  await executeComposioProxy("POST", githubEndpoint("git/refs"), { ref: `refs/heads/${normalized.branch}`, sha: commitSha }, options);
  const created = await executeComposioProxy("POST", githubEndpoint("pulls"), {
    title: normalized.title,
    body: normalized.body,
    head: normalized.branch,
    base: "main",
    draft: true,
  }, options);
  const number = Number(created?.number);
  if (!Number.isSafeInteger(number) || number < 1) fail("composio-github-write-response-invalid", 502);
  const pullRequest = await executeComposioProxy("GET", githubEndpoint(`pulls/${number}`), null, options);
  return projectPullRequest(pullRequest, normalized, commitSha, observedMainSha);
}

export async function executeComposioTool(toolSlug, argumentsValue, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
} = {}) {
  if (toolSlug !== GITHUB_REPOSITORY_TOOL) fail("composio-tool-not-allowed", 403);
  if (!argumentsValue || typeof argumentsValue !== "object" || Array.isArray(argumentsValue)) fail("composio-arguments-invalid", 422);
  if (typeof fetchImpl !== "function") fail("composio-fetch-unavailable", 503);
  const apiKey = String(env.COMPOSIO_API_KEY ?? "").trim();
  if (!apiKey) fail("composio-api-key-unavailable", 503);
  const baseUrl = normalizeBaseUrl(env.COMPOSIO_API_BASE_URL ?? DEFAULT_BASE_URL);
  const body = { arguments: structuredClone(argumentsValue) };
  const toolVersion = String(env.COMPOSIO_GITHUB_TOOL_VERSION ?? "").trim();
  if (toolVersion) body.version = toolVersion;
  const connectedAccountId = String(env.COMPOSIO_GITHUB_CONNECTED_ACCOUNT_ID ?? "").trim();
  const userId = String(env.COMPOSIO_USER_ID ?? "").trim();
  if (connectedAccountId) body.connected_account_id = connectedAccountId;
  else if (userId) body.user_id = userId;
  let response;
  try {
    response = await fetchImpl(`${baseUrl}/tools/execute/${encodeURIComponent(toolSlug)}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") fail("composio-request-timeout", 504);
    fail("composio-request-unreachable", 503);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) fail(`composio-http-${response.status}`, response.status >= 400 && response.status < 600 ? response.status : 502);
  if (!payload || payload.successful !== true || typeof payload.data !== "object" || payload.data === null) fail("composio-response-invalid", 502);
  return payload.data;
}

async function executeComposioProxy(method, endpoint, requestBody, {
  env = process.env,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
} = {}) {
  if (typeof fetchImpl !== "function") fail("composio-fetch-unavailable", 503);
  const apiKey = String(env.COMPOSIO_API_KEY ?? "").trim();
  const connectedAccountId = String(env.COMPOSIO_GITHUB_CONNECTED_ACCOUNT_ID ?? "").trim();
  if (!apiKey) fail("composio-api-key-unavailable", 503);
  if (!/^ca_[A-Za-z0-9_-]{1,200}$/.test(connectedAccountId)) fail("composio-github-connected-account-required", 503);
  const baseUrl = normalizeBaseUrl(env.COMPOSIO_API_BASE_URL ?? DEFAULT_BASE_URL);
  const body = { endpoint, method, connected_account_id: connectedAccountId };
  if (requestBody !== null) body.body = structuredClone(requestBody);
  let response;
  try {
    response = await fetchImpl(`${baseUrl}/tools/execute/proxy`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") fail("composio-request-timeout", 504);
    fail("composio-request-unreachable", 503);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) fail(`composio-http-${response.status}`, response.status >= 400 && response.status < 600 ? response.status : 502);
  const providerStatus = Number(payload?.status);
  if (!Number.isInteger(providerStatus) || providerStatus < 200 || providerStatus >= 300 || typeof payload?.data !== "object" || payload.data === null) {
    fail(Number.isInteger(providerStatus) ? `composio-github-http-${providerStatus}` : "composio-response-invalid", providerStatus >= 400 && providerStatus < 600 ? providerStatus : 502);
  }
  return payload.data;
}

function normalizePullRequestProposal(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("composio-github-proposal-invalid", 422);
  const expectedMainSha = githubSha(value.expectedMainSha, "composio-github-proposal-base-invalid");
  const branch = String(value.branch ?? "").trim();
  if (!/^mahoraga\/[a-z0-9][a-z0-9._-]{2,79}$/.test(branch)) fail("composio-github-proposal-branch-invalid", 422);
  const title = boundedText(value.title, 1, 200, "composio-github-proposal-title-invalid");
  const body = boundedText(value.body, 1, 20_000, "composio-github-proposal-body-invalid");
  const commitMessage = boundedText(value.commitMessage, 1, 200, "composio-github-proposal-commit-invalid");
  if (!Array.isArray(value.files) || value.files.length < 1 || value.files.length > MAX_PROPOSAL_FILES) fail("composio-github-proposal-files-invalid", 422);
  let totalBytes = 0;
  const seen = new Set();
  const files = value.files.map((file) => {
    if (!file || typeof file !== "object" || Array.isArray(file)) fail("composio-github-proposal-file-invalid", 422);
    const path = String(file.path ?? "").trim().replaceAll("\\", "/");
    if (path.length > 240 || path.startsWith("/") || path.split("/").some((part) => !part || part === "." || part === "..") || path === ".git" || path.startsWith(".git/")) fail("composio-github-proposal-path-invalid", 422);
    if (seen.has(path)) fail("composio-github-proposal-path-duplicate", 422);
    seen.add(path);
    if (typeof file.content !== "string") fail("composio-github-proposal-content-invalid", 422);
    totalBytes += Buffer.byteLength(file.content, "utf8");
    return Object.freeze({ path, content: file.content });
  });
  if (totalBytes > MAX_PROPOSAL_BYTES) fail("composio-github-proposal-content-too-large", 413);
  return Object.freeze({ expectedMainSha, branch, title, body, commitMessage, files: Object.freeze(files) });
}

function projectPullRequest(value, proposal, commitSha, baseSha) {
  const number = Number(value?.number);
  const url = String(value?.html_url ?? "");
  if (!Number.isSafeInteger(number) || number < 1 || !/^https:\/\/github\.com\/michaeljwilliams0123\/mahoraga\/pull\/[1-9][0-9]*$/.test(url)
    || value?.draft !== true || value?.head?.ref !== proposal.branch || value?.head?.sha !== commitSha
    || value?.base?.ref !== "main" || value?.base?.sha !== baseSha) fail("composio-github-readback-mismatch", 502);
  return Object.freeze({
    provider: "composio", repository: `${MAHORAGA_OWNER}/${MAHORAGA_REPO}`, number, url,
    state: value?.state === "open" ? "open" : "unknown", draft: true,
    head: Object.freeze({ ref: proposal.branch, sha: commitSha }),
    base: Object.freeze({ ref: "main", sha: baseSha }),
  });
}

function githubEndpoint(suffix) {
  return `/repos/${MAHORAGA_OWNER}/${MAHORAGA_REPO}/${suffix}`;
}

function githubSha(value, code) {
  const sha = String(value ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(sha)) fail(code, 422);
  return sha;
}

function boundedText(value, minimum, maximum, code) {
  const text = String(value ?? "").trim();
  if (text.length < minimum || text.length > maximum) fail(code, 422);
  return text;
}

function projectRepository(value) {
  const permissions = value?.permissions && typeof value.permissions === "object" ? value.permissions : {};
  return Object.freeze({
    fullName: typeof value?.full_name === "string" ? value.full_name : null,
    private: value?.private === true,
    defaultBranch: typeof value?.default_branch === "string" ? value.default_branch : null,
    pushedAt: typeof value?.pushed_at === "string" ? value.pushed_at : null,
    permissions: Object.freeze({
      admin: permissions.admin === true,
      maintain: permissions.maintain === true,
      push: permissions.push === true,
      pull: permissions.pull === true,
      triage: permissions.triage === true,
    }),
  });
}

function normalizeBaseUrl(value) {
  let url;
  try { url = new URL(String(value)); } catch { fail("composio-base-url-invalid", 500); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
    || url.hostname !== "backend.composio.dev" || url.port
    || url.pathname.replace(/\/$/, "") !== "/api/v3.1") fail("composio-base-url-invalid", 500);
  return DEFAULT_BASE_URL;
}

function githubToken(value, code) {
  const token = String(value ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(token)) fail(code, 422);
  return token;
}

function fail(code, status) {
  const error = new TypeError(code);
  error.code = code;
  error.status = status;
  throw error;
}
