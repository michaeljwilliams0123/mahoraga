import { maintainCreditFreeAutonomy } from "./credit-free-autonomy.mjs";

export const WORKERS_AI_FREE_ALLOCATION = 10_000;
export const MAHORAGA_INTERNAL_CEILING = 9_000;
export const INFERENCE_RESERVATION = 128;
export const PROBE_RESERVATION = 4;
export const ADMITTED_HARD_ZERO_PROVIDER = "cloudflare-workers-ai";
export const ADMITTED_HARD_ZERO_MODEL = "@cf/zai-org/glm-4.7-flash";
export const QUOTA_HOLD_ACTION = "quota-hold-until-utc-reset";
export const RESUME_QUEUED_ACTION = "resume-queued";
export const HARD_ZERO_NEXT_ACTIONS = Object.freeze([
  "dispatch-hard-zero",
  QUOTA_HOLD_ACTION,
  RESUME_QUEUED_ACTION,
  "hold-planned",
  "refuse-paid-route",
]);

export function utcDayKey(now = new Date()) {
  const ms = parseTime(now);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

export function utcResetAt(now = new Date()) {
  const day = utcDayKey(now);
  if (!day) return null;
  const next = Date.parse(`${day}T00:00:00.000Z`) + 24 * 60 * 60 * 1000;
  return new Date(next).toISOString();
}

export function classifyHardZeroProvider(provider) {
  const name = String(provider ?? "").trim().toLowerCase();
  if (name === ADMITTED_HARD_ZERO_PROVIDER) return "hard-zero-cloud";
  return "not-hard-zero-cloud";
}

export function evaluateHardZeroQuota({
  provider = ADMITTED_HARD_ZERO_PROVIDER,
  modelId = ADMITTED_HARD_ZERO_MODEL,
  billingVerifiedFree = false,
  unifiedBilling = false,
  workersPaidPlan = false,
  prepaidCreditsUsd = 0,
  spendGrantUsd = 0,
  allowPaidFallback = false,
  neuronsUsedToday = 0,
  reservation = INFERENCE_RESERVATION,
  queued = false,
  idempotencyKey = null,
  now = new Date(),
} = {}) {
  if (allowPaidFallback === true) return quotaBlocked("paid-fallback-forbidden", now);
  if (Number(spendGrantUsd) !== 0) return quotaBlocked("spend-grant-not-zero", now);
  if (Number(prepaidCreditsUsd) !== 0) return quotaBlocked("prepaid-credits-contamination", now);
  if (unifiedBilling === true) return quotaBlocked("unified-billing-forbidden", now);
  if (workersPaidPlan === true) return quotaBlocked("workers-paid-plan-forbidden", now);
  if (billingVerifiedFree !== true) return quotaBlocked("hard-zero-billing-unverified", now);
  if (classifyHardZeroProvider(provider) !== "hard-zero-cloud") {
    return quotaBlocked("hard-zero-provider-not-admitted", now);
  }
  if (String(modelId ?? "").trim() !== ADMITTED_HARD_ZERO_MODEL) {
    return quotaBlocked("hard-zero-model-not-admitted", now);
  }

  const used = Number(neuronsUsedToday);
  const reserve = Number(reservation);
  if (!Number.isFinite(used) || used < 0 || !Number.isFinite(reserve) || reserve < 0) {
    return quotaBlocked("hard-zero-quota-invalid", now);
  }

  const projected = used + reserve;
  const resumeAt = utcResetAt(now);
  const day = utcDayKey(now);
  const envelope = {
    schemaVersion: 1,
    provider: ADMITTED_HARD_ZERO_PROVIDER,
    modelId: ADMITTED_HARD_ZERO_MODEL,
    utcDay: day,
    resumeAt,
    used,
    reservation: reserve,
    projected,
    freeAllocation: WORKERS_AI_FREE_ALLOCATION,
    internalCeiling: MAHORAGA_INTERNAL_CEILING,
    idempotencyKey: idempotencyKey ? String(idempotencyKey) : null,
    creditCost: 0,
    paidFallback: false,
  };

  if (projected > WORKERS_AI_FREE_ALLOCATION || projected > MAHORAGA_INTERNAL_CEILING) {
    return Object.freeze({
      ok: false,
      status: "hold",
      reason: "hard-zero-daily-ceiling-reached",
      nextAction: QUOTA_HOLD_ACTION,
      ...envelope,
    });
  }

  if (queued === true && envelope.idempotencyKey) {
    return Object.freeze({
      ok: true,
      status: "resume",
      reason: "hard-zero-utc-resume-admissible",
      nextAction: RESUME_QUEUED_ACTION,
      ...envelope,
    });
  }

  return Object.freeze({
    ok: true,
    status: "admissible",
    reason: "hard-zero-quota-admissible",
    nextAction: "dispatch-hard-zero",
    ...envelope,
  });
}

export function resumeQueuedHardZeroWork({
  queue = [],
  neuronsUsedToday = 0,
  reservation = INFERENCE_RESERVATION,
  billingVerifiedFree = true,
  unifiedBilling = false,
  workersPaidPlan = false,
  prepaidCreditsUsd = 0,
  now = new Date(),
} = {}) {
  if (!Array.isArray(queue)) {
    return Object.freeze({
      ok: false,
      status: "blocked",
      reason: "hard-zero-queue-invalid",
      admitted: Object.freeze([]),
      held: Object.freeze([]),
      refused: Object.freeze([]),
      creditCost: 0,
      paidFallback: false,
    });
  }

  const seen = new Set();
  const admitted = [];
  const held = [];
  const refused = [];
  let used = Number(neuronsUsedToday);
  if (!Number.isFinite(used) || used < 0) used = 0;

  for (const item of queue) {
    const key = String(item?.idempotencyKey ?? "").trim();
    if (!key) {
      refused.push(quotaBlocked("hard-zero-idempotency-missing", now));
      continue;
    }
    if (seen.has(key)) {
      held.push(Object.freeze({
        ok: false,
        status: "hold",
        reason: "hard-zero-duplicate-idempotency",
        nextAction: "hold-planned",
        idempotencyKey: key,
        creditCost: 0,
        paidFallback: false,
      }));
      continue;
    }
    seen.add(key);
    const decision = evaluateHardZeroQuota({
      ...item,
      idempotencyKey: key,
      queued: true,
      neuronsUsedToday: used,
      reservation,
      billingVerifiedFree,
      unifiedBilling,
      workersPaidPlan,
      prepaidCreditsUsd,
      now,
    });
    if (decision.nextAction === RESUME_QUEUED_ACTION || decision.nextAction === "dispatch-hard-zero") {
      admitted.push(decision);
      used += Number(reservation);
      continue;
    }
    if (decision.nextAction === QUOTA_HOLD_ACTION) {
      held.push(decision);
      continue;
    }
    refused.push(decision);
  }

  const nextAction = refused.length
    ? "refuse-paid-route"
    : admitted.length
      ? RESUME_QUEUED_ACTION
      : held.length
        ? QUOTA_HOLD_ACTION
        : RESUME_QUEUED_ACTION;

  return Object.freeze({
    schemaVersion: 1,
    ok: refused.length === 0,
    status: refused.length ? "blocked" : admitted.length ? "resume" : held.length ? "hold" : "resume",
    reason: refused[0]?.reason ?? (admitted.length ? "hard-zero-queue-resumed" : held[0]?.reason ?? "hard-zero-queue-resumed"),
    nextAction,
    admitted: Object.freeze(admitted),
    held: Object.freeze(held),
    refused: Object.freeze(refused),
    neuronsUsedToday: used,
    utcDay: utcDayKey(now),
    resumeAt: utcResetAt(now),
    creditCost: 0,
    paidFallback: false,
  });
}

export function maintainCreditFreeAutonomyWithQuota({
  workersAi = null,
  ...rest
} = {}) {
  const base = maintainCreditFreeAutonomy(rest);
  if (workersAi == null) {
    return Object.freeze({
      ...base,
      workersAi: null,
    });
  }
  const quota = evaluateHardZeroQuota({
    ...workersAi,
    spendGrantUsd: rest.spendGrantUsd,
    allowPaidFallback: rest.allowPaidFallback,
    now: rest.now,
  });
  let nextAction = base.nextAction;
  if (quota.nextAction === "refuse-paid-route") nextAction = "refuse-paid-route";
  else if (base.nextAction === "refuse-paid-route") nextAction = "refuse-paid-route";
  else if (quota.nextAction === QUOTA_HOLD_ACTION) nextAction = QUOTA_HOLD_ACTION;
  else if (quota.nextAction === RESUME_QUEUED_ACTION && base.nextAction === "dispatch-credit-free") {
    nextAction = RESUME_QUEUED_ACTION;
  }
  return Object.freeze({
    ...base,
    workersAi: quota,
    nextAction,
    creditCost: 0,
    paidFallback: false,
  });
}

function quotaBlocked(reason, now) {
  return Object.freeze({
    ok: false,
    status: "blocked",
    reason,
    nextAction: "refuse-paid-route",
    schemaVersion: 1,
    provider: ADMITTED_HARD_ZERO_PROVIDER,
    modelId: ADMITTED_HARD_ZERO_MODEL,
    utcDay: utcDayKey(now),
    resumeAt: utcResetAt(now),
    creditCost: 0,
    paidFallback: false,
  });
}

function parseTime(value) {
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value ?? ""));
  return Number.isFinite(ms) ? ms : NaN;
}
