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
const MAX_INTERVAL_MS = 10 * 60_000;

const integerEnv = (name, fallback, max) => {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0 || value > max) {
    throw new Error(`provider-watchdog-${name.toLowerCase()}-invalid`);
  }
  return value;
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

const githubJson = async (url, token) => {
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "cache-control": "no-store",
    },
  });
  if (!response.ok) throw new Error(`provider-watchdog-github-${response.status}`);
  return response.json();
};

const verifyRepositoryAndHead = async ({ repository, token, targetSha }) => {
  const repo = await githubJson(`https://api.github.com/repos/${repository}`, token);
  if (repo?.private !== false) throw new Error("provider-watchdog-public-zero-cost-required");
  const branch = await githubJson(`https://api.github.com/repos/${repository}/branches/main`, token);
  if (branch?.commit?.sha !== targetSha) throw new Error("provider-watchdog-source-advanced");
};

const readRuntimeAttestation = async (targetSha) => {
  const response = await fetch("https://mahoraga-execution-runtime.mahoraga-mjw0123.workers.dev/api/runtime/attestation", {
    method: "GET",
    headers: accessHeaders(),
    redirect: "manual",
  });
  const body = await response.json().catch(() => ({}));
  if ((response.status !== 200 && response.status !== 503) || body?.targetSha !== targetSha) {
    throw new Error(`provider-watchdog-runtime-authority-${response.status}:${String(body?.targetSha ?? "unverified")}`);
  }
  if (body?.provider?.providerId !== PROVIDER_ID) throw new Error("provider-watchdog-provider-identity-unverified");
  return body;
};

const renew = async (config) => {
  await verifyRepositoryAndHead(config);
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
  const startedAt = nowFn();
  let cycle = 0;
  let renewals = 0;

  await verifyRepositoryAndHead(config);

  while (true) {
    const observedAt = nowFn();
    let attestation = await readRuntimeAttestation(config.targetSha);
    let renewed = false;
    if (!providerFreshEnough(attestation, observedAt, marginMs, config.targetSha)) {
      const receipt = await renew(config);
      renewals += 1;
      renewed = true;
      attestation = await readRuntimeAttestation(config.targetSha);
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
    await verifyRepositoryAndHead(config);
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
