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
  const token = await mintInstallationToken(options);
  const value = await githubRequest("GET", repoPath(""), null, { ...options, token });
  const permissions = value?.permissions && typeof value.permissions === "object" ? value.permissions : {};
  return Object.freeze({
    fullName: typeof value?.full_name === "string" ? value.full_name : null,
    private: value?.private === true,
    defaultBranch: typeof value?.default_branch === "string" ? value.default_branch : null,
    pushedAt: typeof value?.pushed_at === "string" ? value.pushed_at : null,
    permissions: Object.freeze({
      admin: permissions.admin === true, maintain: permissions.maintain === true,
      push: permissions.push === true, pull: permissions.pull === true, triage: permissions.triage === true,
    }),
  });
}

export async function createMahoragaPullRequestViaGithubApp(proposal, options = {}) {
  const normalized = normalizeProposal(proposal);
  const token = await mintInstallationToken(options);
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
    const blob = await request("POST", repoPath("git/blobs"), { content: Buffer.from(file.content, "utf8").toString("base64"), encoding: "base64" });
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

async function mintInstallationToken({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 15_000 } = {}) {
  const jwt = await createGithubAppJwt(env);
  const installationId = String(env.GITHUB_INSTALLATION_ID).trim();
  const value = await rawRequest("POST", `/app/installations/${installationId}/access_tokens`, {
    repositories: [REPO], permissions: { contents: "write", pull_requests: "write", metadata: "read" },
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
    if (typeof file.content !== "string") fail("github-native-proposal-content-invalid", 422);
    if (sensitive(path, file.content)) fail("github-native-proposal-sensitive", 422);
    bytes += Buffer.byteLength(file.content, "utf8");
    return Object.freeze({ path, content: file.content });
  });
  if (bytes > MAX_BYTES) fail("github-native-proposal-content-too-large", 413);
  return Object.freeze({ expectedMainSha, branch, title, body, commitMessage, files: Object.freeze(files) });
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
function pemBytes(value) { return Buffer.from(value.replace(PKCS8_BEGIN, "").replace(PKCS8_END, "").replace(/\s/g, ""), "base64"); }
function base64url(value) { return Buffer.from(value).toString("base64url"); }
function fail(code, status) { const error = new TypeError(code); error.code = code; error.status = status; throw error; }
