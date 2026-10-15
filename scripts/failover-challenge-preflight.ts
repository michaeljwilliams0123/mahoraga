/** Read-only inventory of captured broker observations; never a live challenge PASS. */
import { open, type FileHandle } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { providerBindingName } from "../deploy/cloudflare-execution-broker/provider-adapter.ts";
import { attestationAllowedForBinding, type ProviderBindingName } from "../deploy/cloudflare-execution-broker/provider-registry.ts";

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const token = (value: unknown): value is string => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(value);

export function inventoryFailoverChallengeRoutes(snapshot: unknown, requiredCapability: string, now = Date.now()) {
  const pool = record(snapshot);
  if (pool?.schemaVersion !== 1 || pool.kind !== "universal-capability-pool" || !Array.isArray(pool.routes)
      || pool.routes.length > 128 || !token(requiredCapability) || !Number.isSafeInteger(now) || now <= 0) {
    throw new Error("failover-inventory-invalid");
  }
  const candidates: Array<{ provider: string; workerId: string; binding: ProviderBindingName }> = [];
  const independentBindings = new Set<string>();
  for (const raw of pool.routes) {
    const route = record(raw);
    if (!route || !token(route.provider) || !token(route.workerId)) continue;
    const binding = providerBindingName(route.provider) as ProviderBindingName | undefined;
    if (!binding || route.capability !== requiredCapability || route.routable !== true || route.enabled !== true
        || route.evidenceLevel !== "runtime-execution" || !["deterministic", "zero-credit"].includes(String(route.costClass))
        || !attestationAllowedForBinding(binding, { capabilities: [route] })) continue;
    const observed = typeof route.lastObservedAt === "string" ? Date.parse(route.lastObservedAt) : NaN;
    const expires = typeof route.expiresAt === "string" ? Date.parse(route.expiresAt) : NaN;
    if (!Number.isFinite(observed) || !Number.isFinite(expires) || observed > now + 5000
        || now - observed > 300_000 || expires <= now || expires - observed > 300_000) continue;
    // Multiple workers or aliases on one execution binding are not independent providers.
    if (independentBindings.has(binding)) continue;
    independentBindings.add(binding);
    candidates.push({ provider: route.provider, workerId: route.workerId, binding });
  }
  return Object.freeze({
    schemaVersion: 1, kind: "failover-challenge-admission-inventory",
    status: candidates.length < 3 ? "blocked" : "live-challenge-required",
    reasonCode: candidates.length < 3 ? "three-distinct-compatible-admitted-providers-required" : "execution-evidence-required",
    requiredCapability, requiredDistinctProviders: 3, compatibleProviderCount: candidates.length,
    candidates, executionChallengeVerified: false, executionAuthorityGranted: false,
    snapshotProvenanceVerified: false,
  });
}

const MAX_SNAPSHOT_BYTES = 1_048_576;

export async function readFailoverChallengeSnapshot(file: FileHandle): Promise<unknown> {
  const metadata = await file.stat();
  if (!metadata.isFile() || metadata.size < 2 || metadata.size > MAX_SNAPSHOT_BYTES) {
    throw new Error("failover-inventory-invalid");
  }
  // Bound allocation and reads even when the regular file grows after stat.
  const bytes = Buffer.alloc(MAX_SNAPSHOT_BYTES + 1);
  let length = 0;
  while (length < bytes.length) {
    const result = await file.read(bytes, length, bytes.length - length, null);
    if (result.bytesRead === 0) break;
    length += result.bytesRead;
  }
  const finalMetadata = await file.stat();
  if (length < 2 || length > MAX_SNAPSHOT_BYTES || length !== metadata.size
      || finalMetadata.size !== metadata.size || !finalMetadata.isFile()) {
    throw new Error("failover-inventory-invalid");
  }
  return JSON.parse(bytes.subarray(0, length).toString("utf8"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [filename, capability] = process.argv.slice(2);
    if (!filename || !capability || process.argv.length !== 4) throw new Error("failover-inventory-invalid");
    const file = await open(filename, "r");
    let snapshot: unknown;
    try { snapshot = await readFailoverChallengeSnapshot(file); }
    finally { await file.close(); }
    const report = inventoryFailoverChallengeRoutes(snapshot, capability);
    process.stdout.write(JSON.stringify(report) + "\n");
    if (report.status === "blocked") process.exitCode = 1;
  } catch {
    process.stderr.write("failover-inventory-invalid\n");
    process.exitCode = 1;
  }
}
