import { execFileSync } from 'node:child_process';

export const RETRY_ATTEMPTS = 3;
export const REQUEST_TIMEOUT_MS = 5_000;
const GITHUB_API_ORIGIN = 'https://api.github.com';

export function assertExactHead({ checkedOutSha, verifiedSha, currentMainSha }) {
  for (const [name, value] of Object.entries({ checkedOutSha, verifiedSha, currentMainSha })) {
    if (!/^[a-f0-9]{40}$/i.test(String(value ?? ''))) throw codedError('exact-head-invalid-' + name);
  }
  if (checkedOutSha !== verifiedSha || currentMainSha !== verifiedSha) {
    throw codedError('stale-verified-main', { checkedOutSha, verifiedSha, currentMainSha });
  }
  return Object.freeze({ checkedOutSha, verifiedSha, currentMainSha });
}

export async function fetchCurrentMainSha({ repository, token, fetchImpl = fetch, attempts = RETRY_ATTEMPTS, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repository ?? ''))) throw codedError('exact-head-repository-invalid');
  if (!token) throw codedError('exact-head-token-required');
  const [owner, name] = String(repository).split('/');
  const endpoint = new URL(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/ref/heads/main`, GITHUB_API_ORIGIN);
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(endpoint, {
        headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28' },
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) throw codedError('exact-head-api-auth-' + response.status);
      if (response.status === 404) throw codedError('exact-head-api-not-found');
      if (!response.ok) {
        lastError = codedError('exact-head-api-' + response.status);
        if (response.status >= 500 && attempt < attempts) continue;
        throw lastError;
      }
      const body = await response.json();
      const sha = body?.object?.sha;
      if (!/^[a-f0-9]{40}$/i.test(String(sha ?? ''))) throw codedError('exact-head-api-response-invalid');
      return String(sha).toLowerCase();
    } catch (error) {
      if (error?.code?.startsWith('exact-head-api-auth-') || error?.code === 'exact-head-api-not-found' || error?.code === 'exact-head-api-response-invalid') throw error;
      lastError = error?.code ? error : codedError(error?.name === 'AbortError' ? 'exact-head-network-timeout' : 'exact-head-network-failure');
      if (attempt === attempts) throw codedError('exact-head-retry-exhausted', { cause: lastError.code ?? 'unknown' });
    } finally {
      clearTimeout(timer);
    }
  }
  throw codedError('exact-head-retry-exhausted', { cause: lastError?.code ?? 'unknown' });
}

function codedError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  Object.assign(error, details);
  return error;
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const checkedOutSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim().toLowerCase();
  const verifiedSha = String(process.env.VERIFIED_SHA ?? '').trim().toLowerCase();
  const currentMainSha = await fetchCurrentMainSha({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN });
  assertExactHead({ checkedOutSha, verifiedSha, currentMainSha });
  console.log(JSON.stringify({ ok: true, checkedOutSha, verifiedSha, currentMainSha }));
}
