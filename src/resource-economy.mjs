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

export function isZeroMarginalCreditEligible(billingClass) {
  if (!BILLING_CLASS_SET.has(billingClass)) return false;
  return billingClass === "deterministic-zero"
    || billingClass === "free-tier-zero"
    || billingClass === "license-included";
}

export function economicTierForBillingClass(billingClass) {
  return BILLING_CLASS_SET.has(billingClass) ? ECONOMIC_TIERS[billingClass] : Number.MAX_SAFE_INTEGER;
}
