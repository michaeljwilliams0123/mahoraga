const HOLD = "hold";
const OK = "ok";
const REFUSED = "refused";

export function createLocalReasonerGenerate({ probe = null, invoke = null, cloudTagged = false } = {}) {
  return function generate({ worldDigest, now = Date.now() } = {}) {
    assertDigest(worldDigest);
    void now;
    if (cloudTagged === true || probe?.cloudTagged === true) {
      return result(REFUSED, "ollama-cloud-not-credit-free", worldDigest);
    }
    if (probe?.verified !== true) {
      return result(HOLD, "local-reasoner-not-ready", worldDigest);
    }
    if (typeof invoke !== "function") {
      return result(HOLD, "generation-invoke-required", worldDigest);
    }
    const produced = invoke({ worldDigest, now, probe });
    assertGenerated(produced);
    return result(
      produced.status,
      produced.status === OK ? "loopback-generate-verified" : produced.reason ?? "loopback-generate-held",
      produced.resultSha256,
    );
  };
}

export function applyLocalReasonerGenerate(generate, input = {}) {
  if (typeof generate !== "function") {
    return result(HOLD, "generation-callback-required", digestOrNull(input.worldDigest));
  }
  const produced = generate(input);
  assertGenerated(produced);
  return produced.status === OK || produced.status === HOLD || produced.status === REFUSED
    ? freezeGenerate(produced)
    : result(HOLD, "generation-result-invalid", digestOrNull(input.worldDigest));
}

function result(status, reason, resultSha256) {
  return freezeGenerate({
    status,
    reason,
    resultSha256,
    creditCost: 0,
    paidFallback: false,
  });
}

function freezeGenerate(value) {
  if ("prompt" in value || "response" in value || "content" in value || "messages" in value) {
    fail("generation-content-forbidden");
  }
  return Object.freeze({
    status: value.status,
    reason: String(value.reason ?? "").slice(0, 80),
    resultSha256: value.resultSha256,
    creditCost: 0,
    paidFallback: false,
  });
}

function assertGenerated(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("generation-result-invalid");
  if (value.status !== OK && value.status !== HOLD && value.status !== REFUSED) fail("generation-result-invalid");
  assertDigest(value.resultSha256);
  if (value.creditCost != null && value.creditCost !== 0) fail("generation-paid-contamination");
  if (value.paidFallback != null && value.paidFallback !== false) fail("generation-paid-contamination");
  if ("prompt" in value || "response" in value || "content" in value || "messages" in value) {
    fail("generation-content-forbidden");
  }
}

function assertDigest(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) fail("generation-digest-invalid");
}

function digestOrNull(value) {
  if (typeof value === "string" && /^[a-f0-9]{64}$/.test(value)) return value;
  fail("generation-digest-invalid");
}

function fail(code) {
  const error = new TypeError(code);
  error.code = code;
  throw error;
}
