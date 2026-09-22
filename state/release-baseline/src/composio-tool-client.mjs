const DEFAULT_BASE_URL = "https://backend.composio.dev/api/v3.1";
const GITHUB_REPOSITORY_TOOL = "GITHUB_GET_A_REPOSITORY";

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
