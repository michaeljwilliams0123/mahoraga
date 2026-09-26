import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_RUNTIME_URL, runAcceptanceProbe, waitForExactRuntimeConvergence, type AcceptanceReceipt } from "./cloudflare-execution-runtime.ts";

const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const EXPECTED_PROVIDER_ID = "cloudflare-workers-ai";
const EXPECTED_MODEL_ID = "@cf/zai-org/glm-4.7-flash";

export type ProductionAcceptanceReceipt = Readonly<AcceptanceReceipt & {
  durableContinuityVerified: true;
  hardZeroBillingVerified: true;
  failClosedZeroBillingVerified: true;
  providerCognitionVerified: true;
  noRailwayFallbackVerified: true;
  providerId: typeof EXPECTED_PROVIDER_ID;
  modelId: typeof EXPECTED_MODEL_ID;
}>;

function normalizeSha(value: string, code: string): string {
  const normalized = value.trim().toLowerCase();
  if (!SHA_PATTERN.test(normalized)) throw new Error(code);
  return normalized;
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`option-value-missing:${name}`);
  return value;
}

function authoritativeMainSha(): string {
  const line = execFileSync("git", ["ls-remote", "origin", "refs/heads/main"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const [sha] = line.split(/\s+/);
  return normalizeSha(sha ?? "", "accept-main-read-invalid");
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function accessHeaders(input: {
  accessToken?: string;
  accessClientId?: string;
  accessClientSecret?: string;
  acceptanceRunId?: string;
}): Headers {
  const token = input.accessToken?.trim() ?? "";
  const clientId = input.accessClientId?.trim() ?? "";
  const clientSecret = input.accessClientSecret?.trim() ?? "";
  if (token && (clientId || clientSecret)) throw new Error("accept-access-credentials-ambiguous");
  const headers = new Headers({ "cache-control": "no-store" });
  if (input.acceptanceRunId) headers.set("x-mahoraga-acceptance-run", input.acceptanceRunId);
  if (token) {
    headers.set("cf-access-token", token);
    return headers;
  }
  if (!clientId || !clientSecret) throw new Error("accept-access-credentials-missing");
  headers.set("cf-access-client-id", clientId);
  headers.set("cf-access-client-secret", clientSecret);
  return headers;
}

export async function proveFailClosedZeroBilling(input: {
  accessToken?: string;
  accessClientId?: string;
  accessClientSecret?: string;
  baseUrl?: string;
  targetSha: string;
  billingAttestation: string;
  providerRefreshSecret: string;
  acceptanceRunId: string;
  fetchImpl?: typeof fetch;
  readyAttempts?: number;
  readyDelayMs?: number;
  providerRestoreAttempts?: number;
  providerRestoreDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const baseUrl = input.baseUrl ?? DEFAULT_RUNTIME_URL;
  await waitForExactRuntimeConvergence({
    ...(input.accessToken ? { accessToken: input.accessToken } : {}),
    ...(input.accessClientId ? { accessClientId: input.accessClientId } : {}),
    ...(input.accessClientSecret ? { accessClientSecret: input.accessClientSecret } : {}),
    baseUrl,
    targetSha: input.targetSha,
    fetchImpl,
    ...(input.readyAttempts !== undefined ? { readyAttempts: input.readyAttempts } : {}),
    ...(input.readyDelayMs !== undefined ? { readyDelayMs: input.readyDelayMs } : {}),
    ...(input.sleep ? { sleep: input.sleep } : {}),
  });
  await waitForExactRuntimeConvergence({
    ...input,
    baseUrl,
    fetchImpl,
  });
  let parsed: unknown;
  try { parsed = JSON.parse(input.billingAttestation); } catch { throw new Error("accept-billing-attestation-json-invalid"); }
  const attestation = jsonRecord(parsed);
  if (!attestation) throw new Error("accept-billing-attestation-json-invalid");
  const expired = JSON.stringify({ ...attestation, verifiedAt: 0, expiresAt: 1 });
  const refresh = async (billingAttestation: string) => {
    const headers = accessHeaders(input);
    headers.set("content-type", "application/json");
    headers.set("x-provider-refresh-token", input.providerRefreshSecret);
    return fetchImpl(new URL("/api/provider/refresh", baseUrl), {
      method: "POST", headers, body: JSON.stringify({ billingAttestation }), redirect: "manual",
    });
  };
  let proofError: unknown = null;
  try {
    const denied = await refresh(expired);
    if (denied.status !== 503) throw new Error(`accept-fail-closed-admission-${denied.status}`);
    const deniedBody = jsonRecord(await denied.json().catch(() => null));
    if (deniedBody?.zeroCreditEligible !== false) throw new Error("accept-fail-closed-admission-invalid");
    const executeHeaders = accessHeaders(input);
    executeHeaders.set("content-type", "application/json");
    executeHeaders.set("x-target-sha", input.targetSha);
    executeHeaders.set("x-idempotency-key", `fail-closed-${input.acceptanceRunId}`);
    const blocked = await fetchImpl(new URL("/api/execute", baseUrl), {
      method: "POST",
      headers: executeHeaders,
      body: JSON.stringify({ conversationId: "acceptance-fail-closed", turnId: `fail-closed-${input.acceptanceRunId}`, message: "This request must not reach inference" }),
      redirect: "manual",
    });
    if (blocked.status !== 503 || blocked.headers.get("x-bypass-applied") !== null) throw new Error(`accept-fail-closed-execution-${blocked.status}`);
  } catch (error) { proofError = error; }
  const restoreAttempts = input.providerRestoreAttempts ?? 6;
  const restoreDelayMs = input.providerRestoreDelayMs ?? 1_000;
  if (!Number.isInteger(restoreAttempts) || restoreAttempts < 1 || restoreAttempts > 30) throw new Error("accept-provider-restore-attempts-invalid");
  if (!Number.isInteger(restoreDelayMs) || restoreDelayMs < 0 || restoreDelayMs > 30_000) throw new Error("accept-provider-restore-delay-invalid");
  const sleep = input.sleep ?? ((milliseconds: number) => new Promise<void>((resolveSleep) => setTimeout(resolveSleep, milliseconds)));
  let restored = await refresh(input.billingAttestation);
  for (let attempt = 1; restored.status === 503 && attempt < restoreAttempts; attempt += 1) {
    await sleep(restoreDelayMs);
    restored = await refresh(input.billingAttestation);
  }
  if (restored.status !== 200) throw new Error(`accept-provider-restore-${restored.status}`);
  const restoredBody = jsonRecord(await restored.json().catch(() => null));
  if (restoredBody?.zeroCreditEligible !== true) throw new Error("accept-provider-restore-invalid");
  if (proofError) throw proofError;
}

async function assertProviderAdmitted(input: {
  accessToken?: string;
  accessClientId?: string;
  accessClientSecret?: string;
  acceptanceRunId?: string;
  baseUrl?: string;
}, fetchImpl: typeof fetch): Promise<void> {
  let url: URL;
  try { url = new URL("/api/capabilities", input.baseUrl ?? DEFAULT_RUNTIME_URL); }
  catch { throw new Error("accept-runtime-url-invalid"); }
  const response = await fetchImpl(url, {
    method: "GET",
    headers: accessHeaders(input),
    redirect: "manual",
  });
  if (response.status !== 200) throw new Error(`accept-provider-preflight-${response.status}`);
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error("accept-provider-preflight-json-invalid"); }
  const record = jsonRecord(body);
  const capabilities = Array.isArray(record?.capabilities) ? record.capabilities : [];
  const assistant = capabilities.map(jsonRecord).find((item) => item?.capability === "assistant.respond") ?? null;
  if (assistant?.routable !== true || assistant.enabled !== true) {
    const rawReason = typeof assistant?.providerReasonCode === "string" ? assistant.providerReasonCode : "provider-not-admitted";
    const reason = /^[a-z0-9.-]{1,120}$/i.test(rawReason) ? rawReason : "provider-not-admitted";
    throw new Error(`accept-provider-not-admitted:${reason}`);
  }
  if (assistant.provider !== EXPECTED_PROVIDER_ID) throw new Error("accept-provider-preflight-id-mismatch");
}

export async function runProductionAcceptance(input: {
  accessToken?: string;
  accessClientId?: string;
  accessClientSecret?: string;
  acceptanceRunId?: string;
  baseUrl?: string;
  targetSha: string;
  idempotencyKey?: string;
  fetchImpl?: typeof fetch;
  now?: () => string;
  readyAttempts?: number;
  readyDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  redeployExactRuntime?: () => Promise<void>;
  proveFailClosedZeroBilling?: () => Promise<void>;
}): Promise<ProductionAcceptanceReceipt> {
  const fetchImpl = input.fetchImpl ?? fetch;
  if (!input.proveFailClosedZeroBilling) throw new Error("accept-fail-closed-proof-missing");
  await input.proveFailClosedZeroBilling();
  await assertProviderAdmitted(input, fetchImpl);
  let providerExecutions = 0;

  const evidenceFetch: typeof fetch = async (requestInput, requestInit) => {
    const request = new Request(requestInput, requestInit);
    const response = await fetchImpl(requestInput, requestInit);
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/execute" && response.status === 200) {
      if (response.headers.get("x-bypass-applied") === "true") throw new Error("accept-railway-fallback-detected");
      let body: unknown;
      try { body = await response.clone().json(); } catch { throw new Error("accept-provider-evidence-json-invalid"); }
      const record = jsonRecord(body);
      if (record?.executed !== true) throw new Error("accept-provider-execution-not-confirmed");
      if (record.providerId !== EXPECTED_PROVIDER_ID) throw new Error("accept-provider-id-mismatch");
      if (record.modelId !== EXPECTED_MODEL_ID) throw new Error("accept-provider-model-mismatch");
      if (response.headers.get("x-idempotent-replay") === null) providerExecutions += 1;
    }
    return response;
  };

  if (!input.redeployExactRuntime) throw new Error("accept-redeploy-proof-missing");
  const receipt = await runAcceptanceProbe({ ...input, fetchImpl: evidenceFetch, afterInitialExecution: input.redeployExactRuntime });
  if (providerExecutions !== 1) throw new Error("accept-provider-execution-not-unique");
  if (!receipt.durableContinuityVerified) throw new Error("accept-durable-continuity-unverified");
  return Object.freeze({
    ...receipt,
    durableContinuityVerified: true as const,
    hardZeroBillingVerified: true as const,
    failClosedZeroBillingVerified: true as const,
    providerCognitionVerified: true,
    noRailwayFallbackVerified: true,
    providerId: EXPECTED_PROVIDER_ID,
    modelId: EXPECTED_MODEL_ID,
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const targetSha = normalizeSha(option(args, "--sha") ?? process.env.GITHUB_SHA ?? "", "accept-target-sha-invalid");
  if (targetSha !== authoritativeMainSha()) throw new Error("accept-main-mismatch");
  const idempotencyKey = option(args, "--idempotency-key");
  if (!idempotencyKey || !/^[a-z0-9-]{1,160}$/i.test(idempotencyKey)) throw new Error("accept-idempotency-key-invalid");
  const redeploySecretsFile = option(args, "--redeploy-secrets-file");
  if (!redeploySecretsFile) throw new Error("accept-redeploy-secrets-file-missing");
  const billingAttestationFile = option(args, "--billing-attestation-file");
  if (!billingAttestationFile) throw new Error("accept-billing-attestation-file-missing");
  const providerRefreshSecret = (process.env.PROVIDER_REFRESH_SECRET ?? "").trim();
  if (!providerRefreshSecret) throw new Error("accept-provider-refresh-secret-missing");
  const billingAttestation = await readFile(resolve(billingAttestationFile), "utf8");
  const credentials = {
    ...(process.env.CLOUDFLARE_ACCESS_TOKEN ? { accessToken: process.env.CLOUDFLARE_ACCESS_TOKEN } : {}),
    ...(process.env.CLOUDFLARE_ACCESS_CLIENT_ID ? { accessClientId: process.env.CLOUDFLARE_ACCESS_CLIENT_ID } : {}),
    ...(process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET ? { accessClientSecret: process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET } : {}),
    acceptanceRunId: idempotencyKey,
  };
  const receipt = await runProductionAcceptance({
    ...credentials,
    baseUrl: option(args, "--url") ?? DEFAULT_RUNTIME_URL,
    targetSha,
    ...(idempotencyKey ? { idempotencyKey } : {}),
    proveFailClosedZeroBilling: () => proveFailClosedZeroBilling({
      ...credentials, baseUrl: option(args, "--url") ?? DEFAULT_RUNTIME_URL, targetSha,
      billingAttestation, providerRefreshSecret, acceptanceRunId: idempotencyKey,
    }),
    redeployExactRuntime: async () => {
      const result = spawnSync(process.execPath, [
        fileURLToPath(new URL("./cloudflare-execution-runtime.ts", import.meta.url)),
        "deploy", "--sha", targetSha, "--secrets-file", redeploySecretsFile,
      ], { stdio: "inherit" });
      if (result.error) throw result.error;
      if (result.status !== 0) throw new Error(`accept-redeploy-exit-${result.status ?? "unknown"}`);
    },
  });
  const rendered = `${JSON.stringify(receipt, null, 2)}\n`;
  const receiptPath = option(args, "--receipt");
  if (receiptPath) writeFileSync(resolve(receiptPath), rendered, { encoding: "utf8" });
  process.stdout.write(rendered);
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "cloudflare-production-acceptance-failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
