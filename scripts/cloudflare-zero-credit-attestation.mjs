import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const ACTIVE_STATES = new Set(["Trial", "Provisioned", "Paid", "AwaitingPayment"]);
const TERMINAL_STATES = new Set(["Cancelled", "Failed", "Expired"]);
const FREE_RATE_PLANS = new Set(["free", "partners_free"]);
const ATTESTATION_TTL_MS = 90 * 60_000;

const objectValue = (value) => value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;

const envelopeResult = (value, expected) => {
  const envelope = objectValue(value);
  if (envelope?.success !== true) throw new Error(`cloudflare-${expected}-evidence-invalid`);
  return envelope.result;
};

export const buildZeroCreditBillingAttestation = ({
  accountIdHash,
  accountSettingsEnvelope,
  subscriptionsEnvelope,
  now = Date.now(),
}) => {
  if (!/^[a-f0-9]{64}$/i.test(accountIdHash) || !Number.isSafeInteger(now) || now <= 0) {
    throw new Error("billing-attestation-input-invalid");
  }
  const settings = objectValue(envelopeResult(accountSettingsEnvelope, "account-settings"));
  if (settings?.default_usage_model !== "bundled") {
    throw new Error("workers-account-usage-model-not-free");
  }
  const subscriptions = envelopeResult(subscriptionsEnvelope, "subscriptions");
  if (!Array.isArray(subscriptions)) throw new Error("cloudflare-subscriptions-evidence-invalid");
  for (const value of subscriptions) {
    const subscription = objectValue(value);
    const state = subscription?.state;
    if (typeof state !== "string" || (!ACTIVE_STATES.has(state) && !TERMINAL_STATES.has(state))) {
      throw new Error("account-subscription-not-provably-free");
    }
    if (TERMINAL_STATES.has(state)) continue;
    const ratePlan = objectValue(subscription.rate_plan);
    const explicitlyFree = subscription.price === 0
      && typeof ratePlan?.id === "string"
      && FREE_RATE_PLANS.has(ratePlan.id)
      && ratePlan.externally_managed === false
      && ratePlan.is_contract === false;
    if (!explicitlyFree) throw new Error("account-subscription-not-provably-free");
  }
  return {
    schemaVersion: 1,
    evidenceSource: "cloudflare-account-api",
    accountIdHash,
    defaultUsageModel: "bundled",
    billableAccountSubscriptionCount: 0,
    verifiedAt: now,
    expiresAt: now + ATTESTATION_TTL_MS,
  };
};

const fetchEvidence = async (url, token, label) => {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${token}`, "cache-control": "no-store" },
  });
  if (!response.ok) throw new Error(`cloudflare-${label}-request-${response.status}`);
  return response.json();
};

const run = async () => {
  const outputIndex = process.argv.indexOf("--output");
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : "";
  const token = (process.env.CLOUDFLARE_API_TOKEN ?? "").trim();
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  if (!output || !token || !/^[a-f0-9]{32}$/i.test(accountId)) throw new Error("cloudflare-billing-evidence-config-invalid");
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
  const [accountSettingsEnvelope, subscriptionsEnvelope] = await Promise.all([
    fetchEvidence(`${base}/workers/account-settings`, token, "account-settings"),
    fetchEvidence(`${base}/subscriptions`, token, "subscriptions"),
  ]);
  const accountIdHash = createHash("sha256").update(accountId).digest("hex");
  const attestation = buildZeroCreditBillingAttestation({ accountIdHash, accountSettingsEnvelope, subscriptionsEnvelope });
  await writeFile(output, JSON.stringify(attestation), { encoding: "utf8", mode: 0o600 });
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
