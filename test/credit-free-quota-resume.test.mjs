import test from "node:test";
import assert from "node:assert/strict";
import {
  ADMITTED_HARD_ZERO_MODEL,
  ADMITTED_HARD_ZERO_PROVIDER,
  INFERENCE_RESERVATION,
  MAHORAGA_INTERNAL_CEILING,
  QUOTA_HOLD_ACTION,
  RESUME_QUEUED_ACTION,
  WORKERS_AI_FREE_ALLOCATION,
  classifyHardZeroProvider,
  evaluateHardZeroQuota,
  maintainCreditFreeAutonomyWithQuota,
  resumeQueuedHardZeroWork,
  utcDayKey,
  utcResetAt,
} from "../src/credit-free-quota-resume.mjs";

const FREE = Object.freeze({
  billingVerifiedFree: true,
  unifiedBilling: false,
  workersPaidPlan: false,
  prepaidCreditsUsd: 0,
  spendGrantUsd: 0,
  allowPaidFallback: false,
  now: new Date("2026-09-26T21:00:00.000Z"),
});

test("classifies only the isolated Cloudflare Workers AI provider as hard-zero cloud", () => {
  assert.equal(classifyHardZeroProvider("cloudflare-workers-ai"), "hard-zero-cloud");
  assert.equal(classifyHardZeroProvider("native-cloud-model"), "not-hard-zero-cloud");
  assert.equal(classifyHardZeroProvider("openai-platform"), "not-hard-zero-cloud");
});

test("utc reset is the next 00:00 UTC day boundary", () => {
  assert.equal(utcDayKey(FREE.now), "2026-09-26");
  assert.equal(utcResetAt(FREE.now), "2026-09-27T00:00:00.000Z");
});

test("admits GLM-4.7-flash under verified free billing inside the 9k ceiling", () => {
  const admitted = evaluateHardZeroQuota({
    ...FREE,
    neuronsUsedToday: 128,
  });
  assert.equal(admitted.ok, true);
  assert.equal(admitted.nextAction, "dispatch-hard-zero");
  assert.equal(admitted.provider, ADMITTED_HARD_ZERO_PROVIDER);
  assert.equal(admitted.modelId, ADMITTED_HARD_ZERO_MODEL);
  assert.equal(admitted.internalCeiling, MAHORAGA_INTERNAL_CEILING);
  assert.equal(admitted.freeAllocation, WORKERS_AI_FREE_ALLOCATION);
  assert.equal(admitted.paidFallback, false);
  assert.equal(admitted.creditCost, 0);
});

test("ceiling exhaustion holds until UTC reset and never buys a route", () => {
  const held = evaluateHardZeroQuota({
    ...FREE,
    neuronsUsedToday: MAHORAGA_INTERNAL_CEILING,
    reservation: INFERENCE_RESERVATION,
    idempotencyKey: "obj-late-answer",
  });
  assert.equal(held.ok, false);
  assert.equal(held.nextAction, QUOTA_HOLD_ACTION);
  assert.equal(held.reason, "hard-zero-daily-ceiling-reached");
  assert.equal(held.resumeAt, "2026-09-27T00:00:00.000Z");
  assert.equal(held.paidFallback, false);
  assert.equal(held.creditCost, 0);
});

test("Unified Billing, Workers Paid, prepaid credits, and paid fallback all refuse", () => {
  const cases = [
    [{ ...FREE, unifiedBilling: true }, "unified-billing-forbidden"],
    [{ ...FREE, workersPaidPlan: true }, "workers-paid-plan-forbidden"],
    [{ ...FREE, prepaidCreditsUsd: 5 }, "prepaid-credits-contamination"],
    [{ ...FREE, spendGrantUsd: 1 }, "spend-grant-not-zero"],
    [{ ...FREE, allowPaidFallback: true }, "paid-fallback-forbidden"],
    [{ ...FREE, billingVerifiedFree: false }, "hard-zero-billing-unverified"],
    [{ ...FREE, modelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" }, "hard-zero-model-not-admitted"],
    [{ ...FREE, provider: "groq" }, "hard-zero-provider-not-admitted"],
  ];
  for (const [input, reason] of cases) {
    const decision = evaluateHardZeroQuota(input);
    assert.equal(decision.reason, reason);
    assert.equal(decision.nextAction, "refuse-paid-route");
    assert.equal(decision.paidFallback, false);
  }
});

test("queued work resumes after UTC reset under the same idempotency key", () => {
  const nextDay = new Date("2026-09-27T00:00:01.000Z");
  const resumed = resumeQueuedHardZeroWork({
    ...FREE,
    now: nextDay,
    neuronsUsedToday: 0,
    queue: [
      { idempotencyKey: "obj-late-answer", provider: ADMITTED_HARD_ZERO_PROVIDER, modelId: ADMITTED_HARD_ZERO_MODEL },
      { idempotencyKey: "obj-late-answer", provider: ADMITTED_HARD_ZERO_PROVIDER, modelId: ADMITTED_HARD_ZERO_MODEL },
    ],
  });
  assert.equal(resumed.nextAction, RESUME_QUEUED_ACTION);
  assert.equal(resumed.admitted.length, 1);
  assert.equal(resumed.admitted[0].idempotencyKey, "obj-late-answer");
  assert.equal(resumed.admitted[0].nextAction, RESUME_QUEUED_ACTION);
  assert.equal(resumed.held.length, 1);
  assert.equal(resumed.held[0].reason, "hard-zero-duplicate-idempotency");
  assert.equal(resumed.paidFallback, false);
});

test("resume still holds when the new UTC day is already at the ceiling", () => {
  const held = resumeQueuedHardZeroWork({
    ...FREE,
    now: new Date("2026-09-27T00:00:01.000Z"),
    neuronsUsedToday: MAHORAGA_INTERNAL_CEILING,
    queue: [{ idempotencyKey: "obj-2", provider: ADMITTED_HARD_ZERO_PROVIDER, modelId: ADMITTED_HARD_ZERO_MODEL }],
  });
  assert.equal(held.nextAction, QUOTA_HOLD_ACTION);
  assert.equal(held.admitted.length, 0);
  assert.equal(held.held[0].resumeAt, "2026-09-28T00:00:00.000Z");
});

test("wrapper preserves existing credit-free behavior when Workers AI evidence is absent", () => {
  const plain = maintainCreditFreeAutonomyWithQuota({ now: FREE.now });
  assert.equal(plain.nextAction, "dispatch-credit-free");
  assert.equal(plain.workersAi, null);
  assert.equal(plain.paidFallback, false);
});

test("wrapper overlays quota-hold without opening a paid recovery path", () => {
  const held = maintainCreditFreeAutonomyWithQuota({
    now: FREE.now,
    workersAi: {
      ...FREE,
      neuronsUsedToday: MAHORAGA_INTERNAL_CEILING,
      idempotencyKey: "obj-hold",
    },
  });
  assert.equal(held.nextAction, QUOTA_HOLD_ACTION);
  assert.equal(held.workersAi.reason, "hard-zero-daily-ceiling-reached");
  assert.equal(held.paidFallback, false);

  const refused = maintainCreditFreeAutonomyWithQuota({
    now: FREE.now,
    workersAi: { ...FREE, unifiedBilling: true },
  });
  assert.equal(refused.nextAction, "refuse-paid-route");
  assert.equal(refused.workersAi.reason, "unified-billing-forbidden");
});
