import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_RUNTIME_URL, runAcceptanceProbe, type AcceptanceReceipt } from "./cloudflare-execution-runtime.ts";

const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const EXPECTED_PROVIDER_ID = "cloudflare-workers-ai";
const EXPECTED_MODEL_ID = "@cf/zai-org/glm-4.7-flash";

export type ProductionAcceptanceReceipt = Readonly<AcceptanceReceipt & {
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

export async function runProductionAcceptance(input: {
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
}): Promise<ProductionAcceptanceReceipt> {
  const fetchImpl = input.fetchImpl ?? fetch;
  let successfulCloudflareExecutions = 0;

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
      successfulCloudflareExecutions += 1;
    }
    return response;
  };

  const receipt = await runAcceptanceProbe({ ...input, fetchImpl: evidenceFetch });
  if (successfulCloudflareExecutions !== 2) throw new Error("accept-provider-evidence-incomplete");
  return Object.freeze({
    ...receipt,
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
  const receipt = await runProductionAcceptance({
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

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "cloudflare-production-acceptance-failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
