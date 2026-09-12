export const BILLING_CLASSES = Object.freeze([
  "deterministic-zero",
  "free-tier-zero",
  "license-included",
  "metered-copilot-credit",
  "metered",
  "unknown",
]);

const BILLING_CLASS_SET = new Set(BILLING_CLASSES);
const ECONOMIC_TIERS = Object.freeze({
  "deterministic-zero": 0,
  "free-tier-zero": 1,
  "license-included": 2,
  "metered-copilot-credit": 3,
  metered: 4,
  unknown: Number.MAX_SAFE_INTEGER,
});

export function validateBillingClass(value) {
  if (!BILLING_CLASS_SET.has(value)) throw new TypeError("billing-class-invalid");
  return value;
}

export function isZeroMarginalCreditEligible(billingClass, quotaAttestation = null, now = Date.now()) {
  if (!BILLING_CLASS_SET.has(billingClass)) return false;
  if (billingClass === "deterministic-zero" || billingClass === "license-included") return true;
  if (billingClass !== "free-tier-zero") return false;
  return hasFreshFreeTierAllowance(quotaAttestation, now);
}

export function economicTierForBillingClass(billingClass) {
  return BILLING_CLASS_SET.has(billingClass) ? ECONOMIC_TIERS[billingClass] : Number.MAX_SAFE_INTEGER;
}

export function hasFreshFreeTierAllowance(value, now = Date.now()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (value.status !== "available") return false;
  if (!Number.isFinite(now) || now < 0) return false;
  const observedAt = Date.parse(value.observedAt);
  const expiresAt = Date.parse(value.expiresAt);
  if (!Number.isFinite(observedAt) || !Number.isFinite(expiresAt)) return false;
  if (observedAt > now || expiresAt <= now || expiresAt <= observedAt) return false;
  return true;
}
