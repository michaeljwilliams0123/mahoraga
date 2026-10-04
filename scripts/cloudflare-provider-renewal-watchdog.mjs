import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  buildZeroCreditBillingAttestation,
  fetchZeroCreditBillingEvidence,
} from "./cloudflare-zero-credit-attestation.mjs";

const PROVIDER_ID = "cloudflare-workers-ai";
const DEFAULT_INTERVAL_MS = 5 * 60_000;
const DEFAULT_DURATION_MS = 320 * 60_000;
const DEFAULT_RENEWAL_MARGIN_MS = 30 * 60_000;
const MAX_DURATION_MS = 320 * 60_000;
const MAX_INTERVAL_MS = DEFAULT_INTERVAL_MS;
const MAX_TRANSPORT_ATTEMPTS = 3;
const TRANSPORT_ATTEMPT_TIMEOUT_MS = 30_000;
const TRANSPORT_RETRY_WINDOW_MS = 120_000;
const TRANSPORT_BACKOFF_BASE_MS = 1_000;
const TRANSPORT_BACKOFF_CAP_MS = 4_000;
const TRANSIENT_TRANSPORT_CODES = Object.freeze([
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "ECONNREFUSED",
]);

const integerEnv = (name, fallback, max) => {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || value > max) {
    throw new Error(`provider-watchdog-${name.toLowerCase()}-invalid`);
  }
  return value;
};

const errorChain = (error) => {
  const chain = [];
  let current = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    chain.push(current);
    current = current?.cause;
  }
  return chain;
};

export const isTransientTransportError = (error) => errorChain(error).some((candidate) =>
  candidate?.name === "TimeoutError"
  || TRANSIENT_TRANSPORT_CODES.includes(candidate?.code),
);

const transportErrorCode = (error) => {
  for (const candidate of errorChain(error)) {
    if (typeof candidate?.code === "string" && candidate.code) return candidate.code;
    if (candidate?.name === "TimeoutError") return "TimeoutError";
  }
  return "unclassified";
};

export const withTransientTransportRetry = async (operation, {
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  nowFn = Date.now,
  onRetry = ({ attempt, code, backoffMs }) => {
    process.stderr.write(`${JSON.stringify({
      status: "provider-watchdog-transient-retry",
      attempt,
      code,
      backoffMs,
    })}\n`);
  },
  maxAttempts = MAX_TRANSPORT_ATTEMPTS,
  attemptTimeoutMs = TRANSPORT_ATTEMPT_TIMEOUT_MS,
  maxElapsedMs = TRANSPORT_RETRY_WINDOW_MS,
} = {}) => {
  if (typeof operation !== "function" || typeof sleep !== "function" || typeof nowFn !== "function" || typeof onRetry !== "function") {
    throw new Error("provider-watchdog-transport-retry-config-invalid");
  }
  for (const value of [maxAttempts, attemptTimeoutMs, maxElapsedMs]) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error("provider-watchdog-transport-retry-config-invalid");
    }
  }

  const startedAt = nowFn();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation({
        attempt,
        signal: AbortSignal.timeout(attemptTimeoutMs),
      });
    } catch (error) {
      if (!isTransientTransportError(error) || attempt >= maxAttempts) throw error;

      const backoffMs = Math.min(
        TRANSPORT_BACKOFF_BASE_MS * (2 ** (attempt - 1)),
        TRANSPORT_BACKOFF_CAP_MS,
      );
      const elapsedMs = Math.max(0, nowFn() - startedAt);
      if (elapsedMs + backoffMs + attemptTimeoutMs > maxElapsedMs) throw error;

      onRetry({ attempt, code: transportErrorCode(error), backoffMs });
      await sleep(backoffMs);
    }
  }

  throw new Error("provider-watchdog-transport-retry-exhausted");
};

const accessHeaders = () => {
  const token = (process.env.CLOUDFLARE_ACCESS_TOKEN ?? "").trim();
  const clientId = (process.env.CLOUDFLARE_ACCESS_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET ?? "").trim();
  const headers = new Headers({ "cache-control": "no-store" });
  if (token) {
    if (clientId || clientSecret) throw new Error("provider-watchdog-access-credentials-ambiguous");
    headers.set("cf-access-token", token);
  } else {
    if (!clientId || !clientSecret) throw new Error("provider-watchdog-access-credentials-missing");
    headers.set("cf-access-client-id", clientId);
    headers.set("cf-access-client-secret", clientSecret);
  }
  return headers;
};

export const providerFreshEnough = (body, now, marginMs, targetSha) => {
  const provider = body?.provider && typeof body.provider === "object" ? body.provider : {};
  return body?.status === "ready"
    && body?.targetSha === targetSha
    && provider.providerId === PROVIDER_ID
    && provider.admitted === true
    && provider.zeroCreditEligible === true
    && Number.isSafeInteger(provider.verifiedAt)
    && Number.isSafeInteger(provider.canaryExpiresAt)
    && provider.verifiedAt <= now
    && provider.canaryExpiresAt > now + marginMs;
};

const requireConfiguration = () => {
  const repository = (process.env.GITHUB_REPOSITORY ?? "").trim();
  const token = (process.env.GITHUB_TOKEN ?? "").trim();
  const targetSha = (process.env.VERIFIED_SHA ?? "").trim();
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  const deploymentToken = (process.env.CLOUDFLARE_API_TOKEN ?? "").trim();
  const refreshSecret = (process.env.PROVIDER_REFRESH_SECRET ?? "").trim();
  if (repository !== "michaeljwilliams0123/mahoraga") throw new Error("provider-watchdog-repository-invalid");
  if (!token || !/^[a-f0-9]{40}$/i.test(targetSha)) throw new Error("provider-watchdog-github-config-invalid");
  if (!/^[a-f0-9]{32}$/i.test(accountId) || !deploymentToken || refreshSecret.length < 32) {
    throw new Error("provider-watchdog-cloudflare-config-invalid");
  }
  return {
    repository,
    token,
    targetSha,
    accountId,
    deploymentToken,
    billingReadToken: (process.env.CLOUDFLARE_BILLING_READ_TOKEN ?? "").trim(),
    refreshSecret,
  };
};

const githubJson = async (url, token, retryOptions = {}) => withTransientTransportRetry(async ({ signal }) => {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "cache-control": "no-store",
    },
    signal,
  });
  if (!response.ok) throw new Error(`provider-watchdog-github-${response.status}`);
  return response.json();
}, retryOptions);

const verifyRepositoryAndHead = async ({ repository, token, targetSha }, retryOptions = {}) => {
  const repo = await githubJson(`https://api.github.com/repos/${repository}`, token, retryOptions);
  if (repo?.private !== false) throw new Error("provider-watchdog-public-zero-cost-required");
  const branch = await githubJson(`https://api.github.com/repos/${repository}/branches/main`, token, retryOptions);
  if (branch?.commit?.sha !== targetSha) throw new Error("provider-watchdog-source-advanced");
};

const readRuntimeAttestation = async (targetSha, retryOptions = {}) => withTransientTransportRetry(async ({ signal }) => {
  const response = await fetch("https://mahoraga-execution-runtime.mahoraga-mjw0123.workers.dev/api/runtime/attestation", {
    method: "GET",
    headers: accessHeaders(),
    redirect: "manual",
    signal,
  });
  let body;
  try {
    body = await response.json();
  } catch (error) {
    if (isTransientTransportError(error)) throw error;
    body = {};
  }
  if ((response.status !== 200 && response.status !== 503) || body?.targetSha !== targetSha) {
    throw new Error(`provider-watchdog-runtime-authority-${response.status}:${String(body?.targetSha ?? "unverified")}`);
  }
  if (body?.provider?.providerId !== PROVIDER_ID) throw new Error("provider-watchdog-provider-identity-unverified");
  return body;
}, retryOptions);

const renew = async (config, retryOptions = {}) => {
  await verifyRepositoryAndHead(config, retryOptions);
  const accountIdHash = createHash("sha256").update(config.accountId).digest("hex");
  const evidence = await fetchZeroCreditBillingEvidence({
    accountId: config.accountId,
    deploymentToken: config.deploymentToken,
    billingReadToken: config.billingReadToken,
  });
  const billingAttestation = buildZeroCreditBillingAttestation({
    accountIdHash,
    ...evidence,
  });
  const headers = accessHeaders();
  headers.set("content-type", "application/json");
  headers.set("x-provider-refresh-token", config.refreshSecret);
  const response = await fetch("https://mahoraga-execution-runtime.mahoraga-mjw0123.workers.dev/api/provider/refresh", {
    method: "POST",
    headers,
    body: JSON.stringify({ billingAttestation: JSON.stringify(billingAttestation) }),
    redirect: "manual",
  });
  const body = await response.json().catch(() => ({}));
  if (response.status !== 200 || body?.providerId !== PROVIDER_ID || body?.zeroCreditEligible !== true) {
    throw new Error(`provider-watchdog-renewal-${response.status}:${String(body?.reasonCode ?? "unverified")}`);
  }
  return body;
};

export const runProviderAdmissionWatchdog = async ({
  nowFn = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) => {
  const config = requireConfiguration();
  const intervalMs = integerEnv("WATCHDOG_INTERVAL_MS", DEFAULT_INTERVAL_MS, MAX_INTERVAL_MS);
  const durationMs = integerEnv("WATCHDOG_DURATION_MS", DEFAULT_DURATION_MS, MAX_DURATION_MS);
  const marginMs = integerEnv("RENEWAL_MARGIN_MS", DEFAULT_RENEWAL_MARGIN_MS, DEFAULT_RENEWAL_MARGIN_MS);
  if (marginMs !== DEFAULT_RENEWAL_MARGIN_MS) throw new Error("provider-watchdog-renewal-margin-immutable");
  const startedAt = nowFn();
  let cycle = 0;
  let renewals = 0;
  const retryOptions = { nowFn, sleep };

  await verifyRepositoryAndHead(config, retryOptions);

  while (true) {
    const observedAt = nowFn();
    let attestation = await readRuntimeAttestation(config.targetSha, retryOptions);
    let renewed = false;
    if (!providerFreshEnough(attestation, observedAt, marginMs, config.targetSha)) {
      const receipt = await renew(config, retryOptions);
      renewals += 1;
      renewed = true;
      attestation = await readRuntimeAttestation(config.targetSha, retryOptions);
      if (!providerFreshEnough(attestation, nowFn(), marginMs, config.targetSha)) {
        throw new Error("provider-watchdog-post-renewal-freshness-unverified");
      }
      process.stdout.write(`${JSON.stringify({
        status: "provider-watchdog-renewed",
        cycle,
        targetSha: config.targetSha,
        providerId: receipt.providerId,
        verifiedAt: receipt.verifiedAt ?? null,
        canaryExpiresAt: receipt.canaryExpiresAt ?? null,
      })}\n`);
    }

    const provider = attestation.provider ?? {};
    process.stdout.write(`${JSON.stringify({
      status: "provider-watchdog-observed",
      cycle,
      renewed,
      targetSha: config.targetSha,
      providerId: provider.providerId ?? null,
      verifiedAt: provider.verifiedAt ?? null,
      canaryExpiresAt: provider.canaryExpiresAt ?? null,
      renewalMarginMs: marginMs,
    })}\n`);

    cycle += 1;
    const elapsed = nowFn() - startedAt;
    if (elapsed >= durationMs) break;
    await sleep(Math.min(intervalMs, durationMs - elapsed));
    await verifyRepositoryAndHead(config, retryOptions);
  }

  process.stdout.write(`${JSON.stringify({
    status: "provider-watchdog-window-complete",
    targetSha: config.targetSha,
    observedCycles: cycle,
    renewals,
    durationMs: nowFn() - startedAt,
  })}\n`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runProviderAdmissionWatchdog();
}
