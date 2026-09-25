import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const ACTIVE_STATES = new Set(["Trial", "Provisioned", "Paid", "AwaitingPayment"]);
const TERMINAL_STATES = new Set(["Cancelled", "Failed", "Expired"]);
const DOCUMENTED_UNRELATED_FREE_ACCOUNT_PLANS = new Set(["teams_free"]);
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
  const defaultUsageModel = settings?.default_usage_model;
  if (typeof defaultUsageModel !== "string" || !defaultUsageModel.trim() || defaultUsageModel.length > 64) {
    throw new Error("cloudflare-account-settings-evidence-invalid");
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
    const planId = typeof ratePlan?.id === "string" ? ratePlan.id.trim().toLowerCase() : "";
    const sets = Array.isArray(ratePlan?.sets) ? ratePlan.sets : [];
    const workersPlan = [ratePlan?.id, ratePlan?.public_name, ...sets]
      .some((signal) => typeof signal === "string" && signal.toLowerCase().includes("workers"));
    const knownUnrelatedFree = DOCUMENTED_UNRELATED_FREE_ACCOUNT_PLANS.has(planId)
      && subscription.price === 0
      && ratePlan?.externally_managed === false
      && ratePlan?.is_contract === false;
    if (knownUnrelatedFree) continue;
    if (workersPlan) {
      const safe = { state, price: subscription.price, planId: ratePlan?.id ?? null, publicName: ratePlan?.public_name ?? null, scope: ratePlan?.scope ?? null, sets: Array.isArray(ratePlan?.sets) ? ratePlan.sets : null, externallyManaged: ratePlan?.externally_managed ?? null, isContract: ratePlan?.is_contract ?? null, componentCount: Array.isArray(subscription.component_values) ? subscription.component_values.length : null };
      throw new Error(`account-subscription-not-provably-free:${JSON.stringify(safe)}`);
    }
    const rawComponents = subscription.component_values;
    if (rawComponents !== undefined && !Array.isArray(rawComponents)) {
      throw new Error("account-subscription-not-provably-free:component-values-invalid");
    }
    const components = rawComponents ?? [];
    const hasBillableComponent = components.some((value) => {
      const component = objectValue(value);
      if (component === null || typeof component.price !== "number" || !Number.isFinite(component.price) || component.price < 0) return true;
      if (component.kind === "usage") return component.price > 0;
      return component.price > 0 && (typeof component.value !== "number" || component.value > 0);
    });
    const explicitlyZeroDollar = subscription.price === 0
      && typeof ratePlan?.id === "string"
      && ratePlan.id.length > 0
      && ratePlan.externally_managed === false
      && ratePlan.is_contract === false
      && !hasBillableComponent;
    if (!explicitlyZeroDollar) {
      const safe = { state, price: subscription.price, planId: ratePlan?.id ?? null, publicName: ratePlan?.public_name ?? null, scope: ratePlan?.scope ?? null, sets: Array.isArray(ratePlan?.sets) ? ratePlan.sets : null, externallyManaged: ratePlan?.externally_managed ?? null, isContract: ratePlan?.is_contract ?? null, componentCount: components.length };
      throw new Error(`account-subscription-not-provably-free:${JSON.stringify(safe)}`);
    }
  }
  return {
    schemaVersion: 1,
    evidenceSource: "cloudflare-account-api",
    accountIdHash,
    defaultUsageModel,
    billableAccountSubscriptionCount: 0,
    verifiedAt: now,
    expiresAt: now + ATTESTATION_TTL_MS,
  };
};

const fetchEvidence = async (url, token, label, fetchImpl) => {
  const response = await fetchImpl(url, {
    headers: { authorization: `Bearer ${token}`, "cache-control": "no-store" },
  });
  if (!response.ok) {
    if (label === "subscriptions" && response.status === 403) {
      throw new Error("cloudflare-subscriptions-billing-read-required-403");
    }
    throw new Error(`cloudflare-${label}-request-${response.status}`);
  }
  return response.json();
};

export const fetchZeroCreditBillingEvidence = async ({
  accountId, deploymentToken, billingReadToken, fetchImpl = fetch,
}) => {
  const base = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
  const [accountSettingsEnvelope, subscriptionsEnvelope] = await Promise.all([
    fetchEvidence(`${base}/workers/account-settings`, deploymentToken, "account-settings", fetchImpl),
    fetchEvidence(`${base}/subscriptions`, billingReadToken || deploymentToken, "subscriptions", fetchImpl),
  ]);
  return { accountSettingsEnvelope, subscriptionsEnvelope };
};

const run = async () => {
  const outputIndex = process.argv.indexOf("--output");
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : "";
  const token = (process.env.CLOUDFLARE_API_TOKEN ?? "").trim();
  const billingReadToken = (process.env.CLOUDFLARE_BILLING_READ_TOKEN ?? "").trim();
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  if (!output || !token || !/^[a-f0-9]{32}$/i.test(accountId)) throw new Error("cloudflare-billing-evidence-config-invalid");
  const { accountSettingsEnvelope, subscriptionsEnvelope } = await fetchZeroCreditBillingEvidence({
    accountId, deploymentToken: token, billingReadToken,
  });
  const accountIdHash = createHash("sha256").update(accountId).digest("hex");
  const attestation = buildZeroCreditBillingAttestation({ accountIdHash, accountSettingsEnvelope, subscriptionsEnvelope });
  await writeFile(output, JSON.stringify(attestation), { encoding: "utf8", mode: 0o600 });
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await run();
}
