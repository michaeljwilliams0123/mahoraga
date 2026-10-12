/**
 * Read-only pre-mutation admission for opt-in Cloudflare inspection.
 * This diagnostic does not grant execution authority or activate a route.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const SCRIPT = "mahoraga-owner-gateway";
const cloudId = (s) => typeof s === "string" && /^[a-zA-Z0-9-]{12,100}$/.test(s);
const record = (s) => s && typeof s === "object" && !Array.isArray(s) ? s : null;

export async function preflightReadonlyActivation({
  accountId, auditToken, billingAttestation,
  fetchImpl = fetch, nowMs = Date.now(),
} = {}) {
  if (typeof accountId !== "string" || !/^[a-f0-9]{32}$/.test(accountId)
      || typeof auditToken !== "string" || auditToken.trim().length < 32) {
    throw new Error("readonly-inspection-credentials-unavailable");
  }
  const billing = record(billingAttestation);
  const accountHash = createHash("sha256").update(accountId).digest("hex");
  if (!billing || billing.schemaVersion !== 1 || billing.evidenceSource !== "cloudflare-account-api"
      || billing.accountIdHash !== accountHash || billing.billableAccountSubscriptionCount !== 0
      || typeof billing.defaultUsageModel !== "string" || !billing.defaultUsageModel
      || !Number.isSafeInteger(nowMs) || !Number.isSafeInteger(billing.verifiedAt)
      || !Number.isSafeInteger(billing.expiresAt) || billing.verifiedAt > nowMs + 5000
      || billing.expiresAt <= nowMs + 60000) {
    throw new Error("readonly-inspection-billing-proof-unavailable");
  }
  const url = "https://api.cloudflare.com/client/v4/accounts/" + accountId + "/workers/scripts/" + SCRIPT + "/deployments";
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { authorization: "Bearer " + auditToken, accept: "application/json", "cache-control": "no-store" },
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new Error("readonly-inspection-read-unavailable");
  }
  if (!response.ok) throw new Error("readonly-inspection-read-unavailable");
  let envelope;
  try { envelope = record(await response.json()); } catch { throw new Error("readonly-inspection-proof-invalid"); }
  const result = record(envelope?.result);
  const deployment = record(Array.isArray(result?.deployments) ? result.deployments[0] : null);
  if (envelope?.success !== true || !deployment || !cloudId(deployment.id)
      || typeof deployment.created_on !== "string" || !Number.isFinite(Date.parse(deployment.created_on))
      || Date.parse(deployment.created_on) > nowMs + 5000
      || !Array.isArray(deployment.versions) || deployment.versions.length !== 1
      || !cloudId(deployment.versions[0]?.version_id) || deployment.versions[0].percentage !== 100) {
    throw new Error("readonly-inspection-proof-invalid");
  }
  return Object.freeze({
    schemaVersion: 1, kind: "readonly-action-activation-preflight",
    status: "admitted-for-deployment-only", accountBillingZeroCredit: true,
    provider: "cloudflare", requestedCapability: "cloud.inspect",
    script: SCRIPT, deploymentId: deployment.id,
    versionId: deployment.versions[0].version_id, trafficPercentage: 100,
    observedAt: new Date(nowMs).toISOString(), executionAuthorityGranted: false,
  });
}

async function main() {
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  const auditToken = (process.env.CLOUDFLARE_READONLY_AUDIT_TOKEN ?? "").trim();
  const filepath = process.env.BILLING_ATTESTATION_FILE ?? "";
  if (!filepath) throw new Error("readonly-inspection-billing-proof-unavailable");
  let billing;
  try { billing = JSON.parse(await readFile(filepath, "utf8")); }
  catch { throw new Error("readonly-inspection-billing-proof-unavailable"); }
  const receipt = await preflightReadonlyActivation({ accountId, auditToken, billingAttestation: billing });
  process.stdout.write(JSON.stringify(receipt) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await main(); }
  catch (error) {
    const allowed = new Set([
      "readonly-inspection-credentials-unavailable",
      "readonly-inspection-billing-proof-unavailable",
      "readonly-inspection-read-unavailable",
      "readonly-inspection-proof-invalid",
    ]);
    const reason = error instanceof Error && allowed.has(error.message) ? error.message : "readonly-inspection-preflight-failed";
    process.stderr.write("::error::" + reason + "\n");
    process.exitCode = 1;
  }
}
