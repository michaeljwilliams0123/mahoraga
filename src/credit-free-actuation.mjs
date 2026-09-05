import { listTransientResults, putTransientResult } from "./local-reasoner-channel.mjs";

const ACTUATION_STATUSES = Object.freeze(["verified", "held", "refused"]);

export function actuateCreditFreeCycle(heartbeat, { now = Date.now(), generate = null } = {}) {
  assertHeartbeat(heartbeat);
  const when = timestampMs(now);

  if (heartbeat.nextAction !== "dispatch-credit-free") {
    return withActuation(heartbeat, {
      status: heartbeat.nextAction === "refuse-paid-route" ? "refused" : "held",
      reason: heartbeat.nextAction,
      resultSha256: heartbeat.worldDigest,
    });
  }

  if (heartbeat.intentKind === "inspect") {
    return withActuation(heartbeat, {
      status: "verified",
      reason: "inspect-reported",
      resultSha256: heartbeat.worldDigest,
    });
  }

  const channel = heartbeat.resultChannel ?? null;
  const execution = heartbeat.localReasonerExecution ?? null;
  if (execution?.executionEnabled !== true || channel == null) {
    return withActuation(heartbeat, {
      status: "held",
      reason: execution?.reason ?? "execution-not-admitted",
      resultSha256: heartbeat.worldDigest,
    });
  }

  const produced = typeof generate === "function"
    ? generate({ channel, admission: execution, worldDigest: heartbeat.worldDigest, now: when })
    : { status: "ok", resultSha256: heartbeat.worldDigest };
  assertGeneratedResult(produced);

  const stored = putTransientResult(channel, {
    status: produced.status,
    resultSha256: produced.resultSha256,
  }, { now: when });
  const results = listTransientResults(channel, when);
  const verified = results.some((item) => item.status === "ok" && item.resultSha256 === stored.resultSha256);

  return withActuation(heartbeat, {
    status: verified ? "verified" : stored.status === "hold" ? "held" : "refused",
    reason: verified ? "generation-result-verified" : "generation-result-unverified",
    resultSha256: stored.resultSha256,
    channelId: channel.id,
  });
}

export function validateActuation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("heartbeat-actuation-invalid");
  if (!ACTUATION_STATUSES.includes(value.status)) fail("heartbeat-actuation-invalid");
  if (typeof value.reason !== "string" || value.reason.length === 0 || value.reason.length > 80) fail("heartbeat-actuation-invalid");
  if (typeof value.resultSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.resultSha256)) fail("heartbeat-actuation-invalid");
  if (value.creditCost !== 0 || value.paidFallback !== false) fail("actuation-paid-contamination");
  if ("prompt" in value || "response" in value || "content" in value || "messages" in value) {
    fail("heartbeat-actuation-content-forbidden");
  }
  return value;
}

function withActuation(heartbeat, actuation) {
  return Object.freeze({
    ...heartbeat,
    actuation: Object.freeze({
      schemaVersion: 1,
      kind: "credit-free-actuation",
      status: actuation.status,
      reason: actuation.reason,
      resultSha256: actuation.resultSha256,
      ...(actuation.channelId ? { channelId: actuation.channelId } : {}),
      creditCost: 0,
      paidFallback: false,
    }),
  });
}

function assertHeartbeat(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("actuation-heartbeat-invalid");
  if (value.kind !== "credit-free-heartbeat") fail("actuation-heartbeat-invalid");
  if (value.creditCost !== 0 || value.paidFallback !== false) fail("actuation-paid-contamination");
  if (typeof value.worldDigest !== "string" || !/^[a-f0-9]{64}$/.test(value.worldDigest)) fail("actuation-digest-invalid");
}

function assertGeneratedResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("actuation-result-invalid");
  if (value.status !== "ok" && value.status !== "hold" && value.status !== "refused") fail("actuation-result-invalid");
  if (typeof value.resultSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.resultSha256)) fail("actuation-digest-invalid");
  if ("prompt" in value || "response" in value || "content" in value || "messages" in value) {
    fail("heartbeat-actuation-content-forbidden");
  }
}

function timestampMs(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return Date.parse(value);
  return Date.now();
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
