import test from "node:test";
import assert from "node:assert/strict";
import {
  admitDestinyDelivery,
  classifyDestinyEventDelivery,
  destinyEventDeliveryMatrix,
  nextDestinyDeliveryRetry,
} from "../src/destiny-event-delivery.mjs";

const owner = "michaeljwilliams0123";

test("owner-opened pull requests schedule GitHub validation and are Destiny-eligible at $0", () => {
  const classified = classifyDestinyEventDelivery({
    actorLogin: owner,
    owner,
    eventName: "pull_request",
    action: "opened",
    zeroCreditEligible: true,
    githubEventId: "evt-owner-opened",
  });
  assert.equal(classified.actor, "owner");
  assert.equal(classified.githubValidation.schedules, true);
  assert.equal(classified.destinyDelivery.delivers, true);
  assert.equal(classified.creditCost, 0);
  assert.equal(classified.paidFallback, false);
});

test("app-created pull requests do not schedule checks and cannot wake Destiny", () => {
  const classified = classifyDestinyEventDelivery({
    actorType: "github-app",
    actorLogin: "destiny-codex-trigger[bot]",
    owner,
    eventName: "pull_request",
    action: "opened",
    zeroCreditEligible: true,
  });
  assert.equal(classified.githubValidation.schedules, false);
  assert.equal(classified.githubValidation.reason, "app-created-pr-check-suite-gap");
  assert.equal(classified.githubValidation.recovery, "workflow_dispatch");
  assert.equal(classified.destinyDelivery.delivers, false);
  assert.equal(classified.destinyDelivery.reason, "app-created-pr-supported-path-restriction");
});

test("synchronize, reopen, and edited events do not re-deliver Destiny work", () => {
  for (const action of ["synchronize", "reopened", "edited"]) {
    const classified = classifyDestinyEventDelivery({
      actorLogin: owner,
      owner,
      eventName: "pull_request",
      action,
      zeroCreditEligible: true,
    });
    assert.equal(classified.githubValidation.schedules, true, action);
    assert.equal(classified.destinyDelivery.delivers, false, action);
  }
});

test("zero-credit ineligibility fails closed without a paid probe", () => {
  const classified = classifyDestinyEventDelivery({
    actorLogin: owner,
    owner,
    eventName: "pull_request",
    action: "opened",
    zeroCreditEligible: false,
  });
  assert.equal(classified.destinyDelivery.reason, "destiny-trigger-zero-credit-not-eligible");
  assert.equal(classified.destinyDelivery.recovery, "hold-planned");
  assert.equal(classified.paidFallback, false);
});

test("duplicate delivery ids cannot execute twice", () => {
  const first = admitDestinyDelivery({ deliveryId: "delivery-1", seenDeliveryIds: [] });
  assert.equal(first.admitted, true);
  const second = admitDestinyDelivery({ deliveryId: "delivery-1", seenDeliveryIds: ["delivery-1"] });
  assert.equal(second.admitted, false);
  assert.equal(second.reason, "duplicate-delivery-suppressed");
});

test("retry backs off, then dead-letters expiry, exhaustion, and the app-created path restriction", () => {
  const retry = nextDestinyDeliveryRetry({
    attempt: 0,
    createdAt: "2026-09-05T13:00:00.000Z",
    now: "2026-09-05T13:01:00.000Z",
  });
  assert.equal(retry.action, "retry");
  assert.equal(retry.backoffMs, 30_000);

  const expired = nextDestinyDeliveryRetry({
    attempt: 0,
    createdAt: "2026-09-05T12:00:00.000Z",
    now: "2026-09-05T13:01:00.000Z",
  });
  assert.equal(expired.reason, "destiny-delivery-expired");

  const exhausted = nextDestinyDeliveryRetry({
    attempt: 3,
    createdAt: "2026-09-05T13:00:00.000Z",
    now: "2026-09-05T13:01:00.000Z",
  });
  assert.equal(exhausted.reason, "destiny-delivery-retry-exhausted");

  const restricted = nextDestinyDeliveryRetry({
    attempt: 0,
    lastFailureReason: "app-created-pr-check-suite-gap",
    createdAt: "2026-09-05T13:00:00.000Z",
    now: "2026-09-05T13:01:00.000Z",
  });
  assert.equal(restricted.action, "dead-letter");
  assert.equal(restricted.reason, "supported-path-restriction");
  assert.equal(restricted.recovery, "workflow_dispatch");
});

test("event matrix covers owner and app actors without paid fallback", () => {
  const matrix = destinyEventDeliveryMatrix();
  assert.equal(matrix.length, 9);
  assert.ok(matrix.every((row) => row.creditCost === 0 && row.paidFallback === false));
  const appOpened = matrix.find((row) => row.actor === "github-app" && row.action === "opened");
  assert.equal(appOpened.githubValidation.schedules, false);
  assert.equal(appOpened.destinyDelivery.delivers, false);
});
