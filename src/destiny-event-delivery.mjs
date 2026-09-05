const OWNER_EVENTS = Object.freeze(["opened", "synchronize", "reopened", "edited"]);
const ACTOR_TYPES = Object.freeze(["owner", "github-app", "bot", "other"]);
const EVENT_NAMES = Object.freeze(["pull_request", "workflow_dispatch", "issue_comment"]);
const RETRY_MAX = 3;
const RETRY_TTL_MS = 3_600_000;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_CAP_MS = 300_000;

function frozen(value) {
  return Object.freeze(value);
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}

function requireObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

export function classifyDestinyEventActor({ actorLogin, owner, actorType } = {}) {
  if (typeof actorType === "string" && ACTOR_TYPES.includes(actorType)) {
    if (actorType === "owner" && typeof actorLogin === "string" && actorLogin === owner) return "owner";
    if (actorType === "owner" && typeof owner === "string" && actorLogin !== owner) fail("destiny-delivery-actor-type-mismatch");
    return actorType;
  }
  if (typeof actorLogin !== "string" || actorLogin.length < 1) fail("destiny-delivery-actor-invalid");
  if (typeof owner === "string" && actorLogin === owner) return "owner";
  if (actorLogin.endsWith("[bot]") || actorLogin === "github-actions[bot]") return "github-app";
  return "other";
}

export function classifyGithubValidationDelivery(input = {}) {
  const event = requireObject(input, "destiny-delivery-event-invalid");
  const actor = classifyDestinyEventActor(event);
  const eventName = event.eventName;
  const action = event.action ?? null;
  if (!EVENT_NAMES.includes(eventName)) {
    return frozen({
      hop: "github-validation",
      schedules: false,
      reason: "destiny-delivery-event-unsupported",
      recovery: "none",
      creditCost: 0,
      paidFallback: false,
    });
  }
  if (eventName === "workflow_dispatch") {
    return frozen({
      hop: "github-validation",
      schedules: true,
      reason: "explicit-workflow-dispatch",
      recovery: "none",
      creditCost: 0,
      paidFallback: false,
    });
  }
  if (eventName === "pull_request" && OWNER_EVENTS.includes(action) && actor === "owner") {
    return frozen({
      hop: "github-validation",
      schedules: true,
      reason: `owner-${action}-pr-schedules`,
      recovery: "none",
      creditCost: 0,
      paidFallback: false,
    });
  }
  if (eventName === "pull_request" && action === "opened" && (actor === "github-app" || actor === "bot")) {
    return frozen({
      hop: "github-validation",
      schedules: false,
      reason: "app-created-pr-check-suite-gap",
      recovery: "workflow_dispatch",
      creditCost: 0,
      paidFallback: false,
    });
  }
  if (eventName === "pull_request" && OWNER_EVENTS.includes(action) && actor !== "owner") {
    return frozen({
      hop: "github-validation",
      schedules: false,
      reason: "non-owner-pr-event-unproven",
      recovery: "workflow_dispatch",
      creditCost: 0,
      paidFallback: false,
    });
  }
  return frozen({
    hop: "github-validation",
    schedules: false,
    reason: "destiny-delivery-event-not-validation",
    recovery: "none",
    creditCost: 0,
    paidFallback: false,
  });
}

export function classifyExternalDestinyDelivery(input = {}) {
  const event = requireObject(input, "destiny-delivery-event-invalid");
  if (event.zeroCreditEligible !== true) {
    return frozen({
      hop: "external-destiny",
      delivers: false,
      reason: "destiny-trigger-zero-credit-not-eligible",
      recovery: "hold-planned",
      creditCost: 0,
      paidFallback: false,
    });
  }
  const actor = classifyDestinyEventActor(event);
  const eventName = event.eventName;
  const action = event.action ?? null;
  if (eventName === "pull_request" && action === "opened" && actor === "owner") {
    return frozen({
      hop: "external-destiny",
      delivers: true,
      reason: "owner-opened-pr-destiny-eligible",
      recovery: "none",
      creditCost: 0,
      paidFallback: false,
    });
  }
  if (eventName === "pull_request" && action === "opened" && (actor === "github-app" || actor === "bot")) {
    return frozen({
      hop: "external-destiny",
      delivers: false,
      reason: "app-created-pr-supported-path-restriction",
      recovery: "owner-authored-envelope",
      creditCost: 0,
      paidFallback: false,
    });
  }
  if (eventName === "pull_request" && (action === "synchronize" || action === "reopened" || action === "edited")) {
    return frozen({
      hop: "external-destiny",
      delivers: false,
      reason: `destiny-delivery-${action}-does-not-retrigger`,
      recovery: "none",
      creditCost: 0,
      paidFallback: false,
    });
  }
  return frozen({
    hop: "external-destiny",
    delivers: false,
    reason: "destiny-delivery-event-not-external",
    recovery: "none",
    creditCost: 0,
    paidFallback: false,
  });
}

export function classifyDestinyEventDelivery(input = {}) {
  const githubValidation = classifyGithubValidationDelivery(input);
  const destinyDelivery = classifyExternalDestinyDelivery(input);
  return frozen({
    schemaVersion: 1,
    actor: classifyDestinyEventActor(input),
    eventName: input.eventName,
    action: input.action ?? null,
    githubValidation,
    destinyDelivery,
    githubEventId: typeof input.githubEventId === "string" ? input.githubEventId : null,
    destinyDeliveryId: typeof input.destinyDeliveryId === "string" ? input.destinyDeliveryId : null,
    creditCost: 0,
    paidFallback: false,
  });
}

export function admitDestinyDelivery({ deliveryId, seenDeliveryIds = [] } = {}) {
  if (typeof deliveryId !== "string" || deliveryId.length < 1 || deliveryId.length > 128) fail("destiny-delivery-id-invalid");
  const seen = Array.isArray(seenDeliveryIds) ? seenDeliveryIds : fail("destiny-delivery-seen-invalid");
  if (seen.includes(deliveryId)) {
    return frozen({
      admitted: false,
      reason: "duplicate-delivery-suppressed",
      creditCost: 0,
      paidFallback: false,
    });
  }
  return frozen({
    admitted: true,
    reason: "accepted",
    deliveryId,
    creditCost: 0,
    paidFallback: false,
  });
}

export function nextDestinyDeliveryRetry({
  attempt = 0,
  lastFailureReason = null,
  createdAt,
  now,
  maxAttempts = RETRY_MAX,
  ttlMs = RETRY_TTL_MS,
} = {}) {
  if (!Number.isSafeInteger(attempt) || attempt < 0) fail("destiny-delivery-attempt-invalid");
  const created = Date.parse(createdAt);
  const current = Date.parse(now);
  if (!Number.isFinite(created) || !Number.isFinite(current)) fail("destiny-delivery-time-invalid");
  if (current < created) fail("destiny-delivery-time-invalid");
  if (current - created > ttlMs) {
    return frozen({
      action: "dead-letter",
      reason: "destiny-delivery-expired",
      creditCost: 0,
      paidFallback: false,
    });
  }
  if (lastFailureReason === "app-created-pr-check-suite-gap" || lastFailureReason === "app-created-pr-supported-path-restriction") {
    return frozen({
      action: "dead-letter",
      reason: "supported-path-restriction",
      recovery: lastFailureReason === "app-created-pr-check-suite-gap" ? "workflow_dispatch" : "owner-authored-envelope",
      creditCost: 0,
      paidFallback: false,
    });
  }
  if (attempt >= maxAttempts) {
    return frozen({
      action: "dead-letter",
      reason: "destiny-delivery-retry-exhausted",
      creditCost: 0,
      paidFallback: false,
    });
  }
  const backoffMs = Math.min(BACKOFF_BASE_MS * (2 ** attempt), BACKOFF_CAP_MS);
  return frozen({
    action: "retry",
    reason: "bounded-backoff",
    attempt: attempt + 1,
    backoffMs,
    creditCost: 0,
    paidFallback: false,
  });
}

export function destinyEventDeliveryMatrix() {
  const actions = ["opened", "synchronize", "reopened", "edited"];
  const actors = ["owner", "github-app"];
  const rows = [];
  for (const actorType of actors) {
    for (const action of actions) {
      rows.push(classifyDestinyEventDelivery({
        actorType,
        actorLogin: actorType === "owner" ? "michaeljwilliams0123" : "destiny-codex-trigger[bot]",
        owner: "michaeljwilliams0123",
        eventName: "pull_request",
        action,
        zeroCreditEligible: true,
      }));
    }
  }
  rows.push(classifyDestinyEventDelivery({
    actorType: "owner",
    actorLogin: "michaeljwilliams0123",
    owner: "michaeljwilliams0123",
    eventName: "workflow_dispatch",
    zeroCreditEligible: true,
  }));
  return frozen(rows);
}
