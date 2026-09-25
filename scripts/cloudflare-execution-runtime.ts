import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const INVALID_TARGET_SHA = "UNSET";
export const DEFAULT_CONFIG = "deploy/cloudflare-execution-runtime/wrangler.jsonc";
export const DEFAULT_RUNTIME_URL = "https://mahoraga-execution-runtime.mahoraga-mjw0123.workers.dev";
const WRANGLER_VERSION = "4.132.0";
const DEFAULT_READY_ATTEMPTS = 37;
const DEFAULT_READY_DELAY_MS = 5_000;
const SHA_PATTERN = /^[a-f0-9]{40}$/i;

export type DeployableSource = {
  targetSha: string;
  headSha: string;
  remoteMainSha: string;
  statusPorcelain: string;
};

export type AcceptanceReceipt = Readonly<{
  schemaVersion: 1;
  kind: "cloudflare-execution-runtime-acceptance";
  status: "accepted";
  targetSha: string;
  accessProtected: true;
  ready: true;
  durableStateVerified: true;
  runtimeAttestationVerified: true;
  trafficAuthorityVerified: true;
  railwayNoRouteVerified: true;
  railwayNoInfluenceVerified: true;
  staleShaRejected: true;
  executed: true;
  replayed: true;
  durableContinuityVerified: boolean;
  executionUniqueness: Readonly<{
    logicalRequests: number;
    providerExecutions: 1;
    receipts: 1;
    conflicts: number;
    replays: number;
    atMostOneVerified: true;
  }>;
  observedAt: string;
}>;

function normalizeSha(value: string, code: string): string {
  const normalized = value.trim().toLowerCase();
  if (!SHA_PATTERN.test(normalized)) throw new Error(code);
  return normalized;
}

function normalizeHttpsUrl(value: string, code: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(code);
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(code);
  }
  return parsed.toString();
}

export function assertDeployableSource(input: DeployableSource): void {
  const targetSha = normalizeSha(input.targetSha, "deploy-target-sha-invalid");
  const headSha = normalizeSha(input.headSha, "deploy-head-sha-invalid");
  const remoteMainSha = normalizeSha(input.remoteMainSha, "deploy-main-sha-invalid");
  if (headSha !== targetSha) throw new Error("deploy-head-mismatch");
  if (remoteMainSha !== targetSha) throw new Error("deploy-main-mismatch");
  if (input.statusPorcelain.trim().length > 0) throw new Error("deploy-worktree-dirty");
}

export function buildWranglerDeployArgs(input: {
  targetSha: string;
  configPath?: string;
  secretsFile?: string;
}): string[] {
  const targetSha = normalizeSha(input.targetSha, "deploy-target-sha-invalid");
  const configPath = input.configPath ?? DEFAULT_CONFIG;
  const args = [
    "--yes",
    `wrangler@${WRANGLER_VERSION}`,
    "deploy",
    "--config",
    configPath,
    "--var",
    `TARGET_SHA:${targetSha}`,
  ];
  const secretsFile = input.secretsFile?.trim();
  if (input.secretsFile !== undefined && !secretsFile) throw new Error("deploy-secrets-file-invalid");
  if (secretsFile) args.push("--secrets-file", secretsFile);
  return args;
}

function alternateSha(targetSha: string): string {
  return `${targetSha[0] === "0" ? "1" : "0"}${targetSha.slice(1)}`;
}

async function readJson(response: Response, code: string): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(code);
  }
  if (body === null || Array.isArray(body) || typeof body !== "object") throw new Error(code);
  return body as Record<string, unknown>;
}

type CloudflareAccessCredentials = {
  accessToken?: string;
  accessClientId?: string;
  accessClientSecret?: string;
};

function cloudflareAccessHeaders(input: CloudflareAccessCredentials): Headers {
  const accessToken = input.accessToken?.trim() ?? "";
  const accessClientId = input.accessClientId?.trim() ?? "";
  const accessClientSecret = input.accessClientSecret?.trim() ?? "";
  if (accessToken && (accessClientId || accessClientSecret)) throw new Error("accept-access-credentials-ambiguous");
  const headers = new Headers({ "cache-control": "no-store" });
  if (accessToken) {
    headers.set("cf-access-token", accessToken);
    return headers;
  }
  if (!accessClientId || !accessClientSecret) throw new Error("accept-access-credentials-missing");
  headers.set("cf-access-client-id", accessClientId);
  headers.set("cf-access-client-secret", accessClientSecret);
  return headers;
}

function executionHeaders(accessHeaders: Headers, targetSha: string, idempotencyKey: string): Headers {
  const headers = new Headers(accessHeaders);
  headers.set("content-type", "application/json");
  headers.set("x-idempotency-key", idempotencyKey);
  headers.set("x-target-sha", targetSha);
  return headers;
}

export async function waitForExactRuntimeConvergence(input: CloudflareAccessCredentials & {
  baseUrl?: string;
  targetSha: string;
  fetchImpl?: typeof fetch;
  readyAttempts?: number;
  readyDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}): Promise<void> {
  const accessHeaders = cloudflareAccessHeaders(input);
  const targetSha = normalizeSha(input.targetSha, "deploy-target-sha-invalid");
  const baseUrl = normalizeHttpsUrl(input.baseUrl ?? DEFAULT_RUNTIME_URL, "deploy-runtime-url-invalid");
  const fetchImpl = input.fetchImpl ?? fetch;
  const readyAttempts = input.readyAttempts ?? DEFAULT_READY_ATTEMPTS;
  const readyDelayMs = input.readyDelayMs ?? DEFAULT_READY_DELAY_MS;
  const sleep = input.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  if (!Number.isInteger(readyAttempts) || readyAttempts < 1 || readyAttempts > 61) throw new Error("deploy-convergence-attempts-invalid");
  if (!Number.isInteger(readyDelayMs) || readyDelayMs < 0 || readyDelayMs > 10_000) throw new Error("deploy-convergence-delay-invalid");

  for (let attempt = 1; attempt <= readyAttempts; attempt += 1) {
    try {
      const [liveResponse, readyResponse] = await Promise.all([
        fetchImpl(new URL("/api/live", baseUrl), { method: "GET", headers: accessHeaders, redirect: "manual" }),
        fetchImpl(new URL("/api/ready", baseUrl), { method: "GET", headers: accessHeaders, redirect: "manual" }),
      ]);
      if (liveResponse.status === 200 && readyResponse.status === 200) {
        const [liveBody, readyBody] = await Promise.all([
          readJson(liveResponse, "deploy-live-json-invalid"),
          readJson(readyResponse, "deploy-ready-json-invalid"),
        ]);
        if (
          liveBody.status === "live"
          && liveBody.sha === targetSha
          && readyBody.status === "ready"
          && readyBody.sha === targetSha
          && readyBody.durableState === "cloudflare-do-sqlite"
        ) return;
      }
    } catch {
      // Deployment propagation can briefly make the Worker or Durable Object unreachable.
    }
    if (attempt < readyAttempts) await sleep(readyDelayMs);
  }
  throw new Error("deploy-runtime-convergence-timeout");
}

export async function runAcceptanceProbe(input: {
  accessToken?: string;
  accessClientId?: string;
  accessClientSecret?: string;
  baseUrl?: string;
  targetSha: string;
  idempotencyKey?: string;
  fetchImpl?: typeof fetch;
  now?: () => string;
  readyAttempts?: number;
  readyDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  afterInitialExecution?: () => Promise<void>;
}): Promise<AcceptanceReceipt> {
  const accessHeaders = cloudflareAccessHeaders(input);
  const targetSha = normalizeSha(input.targetSha, "accept-target-sha-invalid");
  const baseUrl = normalizeHttpsUrl(input.baseUrl ?? DEFAULT_RUNTIME_URL, "accept-runtime-url-invalid");
  const idempotencyKey = (input.idempotencyKey ?? `accept-${crypto.randomUUID()}`).trim();
  if (!idempotencyKey || idempotencyKey.length > 200) throw new Error("accept-idempotency-key-invalid");
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? (() => new Date().toISOString());
  const readyAttempts = input.readyAttempts ?? DEFAULT_READY_ATTEMPTS;
  const readyDelayMs = input.readyDelayMs ?? DEFAULT_READY_DELAY_MS;
  const sleep = input.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  if (!Number.isInteger(readyAttempts) || readyAttempts < 1 || readyAttempts > 61) throw new Error("accept-ready-attempts-invalid");
  if (!Number.isInteger(readyDelayMs) || readyDelayMs < 0 || readyDelayMs > 10_000) throw new Error("accept-ready-delay-invalid");

  const unauthenticatedResponse = await fetchImpl(new URL("/api/ready", baseUrl), {
    method: "GET",
    headers: { "cache-control": "no-store" },
    redirect: "manual",
  });
  if (unauthenticatedResponse.status >= 200 && unauthenticatedResponse.status < 300) {
    throw new Error("accept-access-not-enforced");
  }

  // Durable Object code and bindings can briefly lag the Worker deployment; require exact provenance before proceeding.
  let ready = false;
  for (let attempt = 1; attempt <= readyAttempts; attempt += 1) {
    let readyResponse: Response;
    try {
      readyResponse = await fetchImpl(new URL("/api/ready", baseUrl), {
        method: "GET",
        headers: accessHeaders,
        redirect: "manual",
      });
    } catch {
      if (attempt === readyAttempts) throw new Error("accept-ready-unreachable");
      await sleep(readyDelayMs);
      continue;
    }
    if (readyResponse.status === 200) {
      const readyBody = await readJson(readyResponse, "accept-ready-json-invalid");
      if (readyBody.status === "ready" && readyBody.sha === targetSha
        && readyBody.durableState === "cloudflare-do-sqlite") {
        ready = true;
        break;
      }
      if (attempt === readyAttempts) throw new Error("accept-ready-provenance-mismatch");
      await sleep(readyDelayMs);
      continue;
    }
    if (readyResponse.status >= 500 && attempt < readyAttempts) {
      await sleep(readyDelayMs);
      continue;
    }
    throw new Error(`accept-ready-${readyResponse.status}`);
  }
  if (!ready) throw new Error("accept-ready-provenance-mismatch");

  const attestationResponse = await fetchImpl(new URL("/api/runtime/attestation", baseUrl), {
    method: "GET",
    headers: accessHeaders,
    redirect: "manual",
  });
  if (attestationResponse.status !== 200) throw new Error(`accept-runtime-attestation-${attestationResponse.status}`);
  const attestation = await readJson(attestationResponse, "accept-runtime-attestation-json-invalid");
  const provider = attestation.provider !== null && typeof attestation.provider === "object" && !Array.isArray(attestation.provider)
    ? attestation.provider as Record<string, unknown>
    : null;
  if (
    attestation.schemaVersion !== 1
    || attestation.kind !== "mahoraga-runtime-attestation"
    || attestation.status !== "ready"
    || attestation.targetSha !== targetSha
    || attestation.runtime !== "cloudflare-worker"
    || attestation.durableState !== "cloudflare-do-sqlite"
    || attestation.trafficAuthority !== "cloudflare"
    || attestation.railwayRoutingEnabled !== false
    || attestation.railwayInfluence !== false
    || provider?.providerId !== "cloudflare-workers-ai"
    || provider.admitted !== true
    || provider.zeroCreditEligible !== true
  ) throw new Error("accept-runtime-attestation-mismatch");
  if (attestationResponse.headers.get("server")?.toLowerCase() !== "cloudflare" || !attestationResponse.headers.get("cf-ray")) {
    throw new Error("accept-cloudflare-route-authority-unverified");
  }

  const staleResponse = await fetchImpl(new URL("/api/execute", baseUrl), {
    method: "POST",
    headers: executionHeaders(accessHeaders, alternateSha(targetSha), `${idempotencyKey}-stale`),
    body: JSON.stringify({ conversationId: "acceptance-stale", turnId: `${idempotencyKey}-stale`, message: "Acceptance stale-SHA probe" }),
    redirect: "manual",
  });
  if (staleResponse.status !== 412) throw new Error(`accept-stale-sha-not-rejected-${staleResponse.status}`);

  const executeRequest = () => fetchImpl(new URL("/api/execute", baseUrl), {
    method: "POST",
    headers: executionHeaders(accessHeaders, targetSha, idempotencyKey),
    body: JSON.stringify({ conversationId: "acceptance-live", turnId: idempotencyKey, message: "Acceptance cognition probe" }),
    redirect: "manual",
  });
  const concurrentResponses = await Promise.all([executeRequest(), executeRequest(), executeRequest(), executeRequest()]);
  const conflicts = concurrentResponses.filter((response) => response.status === 409).length;
  const successful = concurrentResponses.filter((response) => response.status === 200);
  if (successful.length + conflicts !== concurrentResponses.length) {
    const rejected = concurrentResponses.find((response) => response.status !== 200 && response.status !== 409)!;
    throw new Error(`accept-execute-${rejected.status}`);
  }
  const originalResponses = successful.filter((response) => response.headers.get("x-idempotent-replay") === null);
  if (originalResponses.length !== 1) throw new Error("accept-provider-execution-not-unique");
  let replayResponses = successful.filter((response) => response.headers.get("x-idempotent-replay") === "true");
  const firstBody = await readJson(originalResponses[0]!, "accept-execute-json-invalid");
  if (firstBody.executed !== true) throw new Error("accept-execution-not-confirmed");
  let logicalRequests = concurrentResponses.length;
  if (replayResponses.length === 0) {
    const replayResponse = await executeRequest();
    logicalRequests += 1;
    if (replayResponse.status !== 200) throw new Error(`accept-replay-${replayResponse.status}`);
    replayResponses = [replayResponse];
  }
  for (const replayResponse of replayResponses) {
    if (replayResponse.headers.get("x-idempotent-replay") !== "true") throw new Error("accept-replay-header-missing");
    const replayBody = await readJson(replayResponse, "accept-replay-json-invalid");
    if (JSON.stringify(replayBody) !== JSON.stringify(firstBody)) throw new Error("accept-replay-payload-drift");
  }
  let durableContinuityVerified = false;
  if (input.afterInitialExecution) {
    await input.afterInitialExecution();
    const continuityResponse = await executeRequest();
    logicalRequests += 1;
    if (continuityResponse.status !== 200 || continuityResponse.headers.get("x-idempotent-replay") !== "true") {
      throw new Error(`accept-durable-continuity-${continuityResponse.status}`);
    }
    const continuityBody = await readJson(continuityResponse, "accept-durable-continuity-json-invalid");
    if (JSON.stringify(continuityBody) !== JSON.stringify(firstBody)) throw new Error("accept-durable-continuity-payload-drift");
    replayResponses.push(continuityResponse);
    durableContinuityVerified = true;
  }

  return Object.freeze({
    schemaVersion: 1,
    kind: "cloudflare-execution-runtime-acceptance",
    status: "accepted",
    targetSha,
    accessProtected: true,
    ready: true,
    durableStateVerified: true,
    runtimeAttestationVerified: true,
    trafficAuthorityVerified: true,
    railwayNoRouteVerified: true,
    railwayNoInfluenceVerified: true,
    staleShaRejected: true,
    executed: true,
    replayed: true,
    durableContinuityVerified,
    executionUniqueness: Object.freeze({
      logicalRequests,
      providerExecutions: 1 as const,
      receipts: 1 as const,
      conflicts,
      replays: replayResponses.length,
      atMostOneVerified: true as const,
    }),
    observedAt: now(),
  });
}

function gitOutput(args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function authoritativeMainSha(): string {
  const line = gitOutput(["ls-remote", "origin", "refs/heads/main"]);
  const [sha] = line.split(/\s+/);
  return normalizeSha(sha ?? "", "deploy-main-read-invalid");
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`option-value-missing:${name}`);
  return value;
}

function deploymentTarget(args: string[]): string {
  return normalizeSha(option(args, "--sha") ?? process.env.GITHUB_SHA ?? "", "deploy-target-sha-invalid");
}

export function buildNpxProcess(args: string[], platform: NodeJS.Platform = process.platform, comSpec = process.env.ComSpec): { command: string; args: string[] } {
  if (platform === "win32") return { command: comSpec?.trim() || "cmd.exe", args: ["/d", "/s", "/c", "npx.cmd", ...args] };
  return { command: "npx", args };
}

async function deploy(args: string[]): Promise<void> {
  const targetSha = deploymentTarget(args);
  const remoteMainSha = authoritativeMainSha();
  const headSha = gitOutput(["rev-parse", "HEAD"]);
  const statusPorcelain = gitOutput(["status", "--porcelain"]);
  assertDeployableSource({ targetSha, headSha, remoteMainSha, statusPorcelain });

  const secretsFile = option(args, "--secrets-file");
  const wranglerArgs = buildWranglerDeployArgs({
    targetSha,
    ...(secretsFile ? { secretsFile } : {}),
  });
  const wranglerProcess = buildNpxProcess(wranglerArgs);
  const result = spawnSync(wranglerProcess.command, wranglerProcess.args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`deploy-wrangler-exit-${result.status ?? "unknown"}`);

  await waitForExactRuntimeConvergence({
    ...(process.env.CLOUDFLARE_ACCESS_TOKEN ? { accessToken: process.env.CLOUDFLARE_ACCESS_TOKEN } : {}),
    ...(process.env.CLOUDFLARE_ACCESS_CLIENT_ID ? { accessClientId: process.env.CLOUDFLARE_ACCESS_CLIENT_ID } : {}),
    ...(process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET ? { accessClientSecret: process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET } : {}),
    targetSha,
  });

  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    kind: "cloudflare-execution-runtime-deploy",
    status: "deployed-exact-main",
    targetSha,
    runtimeConverged: true,
    railwayRoutingEnabled: false,
    observedAt: new Date().toISOString(),
  })}\n`);
}

async function accept(args: string[]): Promise<void> {
  const remoteMainSha = authoritativeMainSha();
  const requestedSha = option(args, "--sha");
  const targetSha = requestedSha ? normalizeSha(requestedSha, "accept-target-sha-invalid") : remoteMainSha;
  if (targetSha !== remoteMainSha) throw new Error("accept-main-mismatch");
  const idempotencyKey = option(args, "--idempotency-key");
  const receipt = await runAcceptanceProbe({
    ...(process.env.CLOUDFLARE_ACCESS_TOKEN ? { accessToken: process.env.CLOUDFLARE_ACCESS_TOKEN } : {}),
    ...(process.env.CLOUDFLARE_ACCESS_CLIENT_ID ? { accessClientId: process.env.CLOUDFLARE_ACCESS_CLIENT_ID } : {}),
    ...(process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET ? { accessClientSecret: process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET } : {}),
    baseUrl: option(args, "--url") ?? DEFAULT_RUNTIME_URL,
    targetSha,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });
  const rendered = `${JSON.stringify(receipt, null, 2)}\n`;
  const receiptPath = option(args, "--receipt");
  if (receiptPath) writeFileSync(resolve(receiptPath), rendered, { encoding: "utf8" });
  process.stdout.write(rendered);
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === "deploy") return deploy(args);
  if (command === "accept") return accept(args);
  throw new Error("usage: cloudflare-execution-runtime.ts <deploy|accept> [options]");
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "cloudflare-execution-runtime-failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
