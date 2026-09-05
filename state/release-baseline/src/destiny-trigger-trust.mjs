import { createHash, createPublicKey, verify } from "node:crypto";

const READY_STATES = new Set(["ready", "not-configured", "auth-stale", "delivery-degraded", "unknown"]);
const RECEIPT_KINDS = new Set(["acked", "running", "result", "rejected", "expired"]);
const TERMINAL_KINDS = new Set(["result", "rejected", "expired"]);
const SHA40 = /^[a-f0-9]{40}$/;
const SHA64 = /^[a-f0-9]{64}$/;
const DISPATCH_ID = /^dcx-[a-f0-9]{24}$/;
const KEY_ID = /^[a-z0-9][a-z0-9-]{2,63}$/;
const SPKI = /^-----BEGIN PUBLIC KEY-----[\r\n]+(?:[A-Za-z0-9+/=\r\n]+)-----END PUBLIC KEY-----\r?\n?$/;
const SIGNATURE = /^[A-Za-z0-9_-]{80,128}$/;

function frozen(value) {
  return Object.freeze(value);
}

function validDate(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function requireObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(code);
  return value;
}

function sameReceipt(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
  }
  return value;
}

export function fingerprintPublicKeySpki(publicKeySpki) {
  if (typeof publicKeySpki !== "string" || !SPKI.test(publicKeySpki)) throw new TypeError("destiny-trigger-public-key-invalid");
  const key = createPublicKey(publicKeySpki);
  if (key.asymmetricKeyType !== "ed25519") throw new TypeError("destiny-trigger-algorithm-confusion");
  const pem = key.export({ type: "spki", format: "pem" });
  return createHash("sha256").update(pem).digest("hex");
}

function canonicalWithoutSignature(value) {
  const { signature: _signature, ...rest } = value;
  void _signature;
  return JSON.stringify(sortValue(rest));
}

function verifySignedPayload(publicKeySpki, payload, signature) {
  if (typeof signature !== "string" || !SIGNATURE.test(signature)) return false;
  try {
    return verify(null, Buffer.from(payload), createPublicKey(publicKeySpki), Buffer.from(signature, "base64url"));
  } catch {
    return false;
  }
}

function validateSignedReceiptTrust(trust, owner) {
  if (trust.algorithm !== "ed25519") throw new TypeError("destiny-trigger-manifest-invalid");
  if (typeof trust.publicKeyFingerprint !== "string" || !SHA64.test(trust.publicKeyFingerprint)) throw new TypeError("destiny-trigger-manifest-invalid");
  const keys = Object.keys(trust).sort();
  if (trust.keyId != null) {
    if (typeof trust.keyId !== "string" || !KEY_ID.test(trust.keyId)) throw new TypeError("destiny-trigger-manifest-invalid");
    if (trust.keyId === owner) throw new TypeError("destiny-trigger-actor-not-independent");
    if (keys.join(",") !== "algorithm,keyId,mode,publicKeyFingerprint") throw new TypeError("destiny-trigger-manifest-invalid");
  } else if (keys.join(",") !== "algorithm,mode,publicKeyFingerprint") {
    throw new TypeError("destiny-trigger-manifest-invalid");
  }
}

export function ownerAuthoredCommentCannotProveExecution(owner, actorLogin) {
  return typeof actorLogin === "string" && actorLogin.length > 0 && actorLogin === owner;
}

export function validateDestinyTriggerTrustManifest(input) {
  const manifest = requireObject(input, "destiny-trigger-manifest-invalid");
  if (manifest.schemaVersion !== 1) throw new TypeError("destiny-trigger-manifest-invalid");
  if (typeof manifest.triggerId !== "string" || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(manifest.triggerId)) throw new TypeError("destiny-trigger-manifest-invalid");
  if (typeof manifest.repository !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(manifest.repository)) throw new TypeError("destiny-trigger-manifest-invalid");
  if (typeof manifest.owner !== "string" || !/^[A-Za-z0-9_.-]+$/.test(manifest.owner)) throw new TypeError("destiny-trigger-manifest-invalid");
  if (!Number.isSafeInteger(manifest.readinessMaxAgeMs) || manifest.readinessMaxAgeMs < 1000 || manifest.readinessMaxAgeMs > 3600000) throw new TypeError("destiny-trigger-manifest-invalid");
  if (manifest.zeroCreditRequired !== true) throw new TypeError("destiny-trigger-zero-credit-required");
  const trust = requireObject(manifest.receiptTrust, "destiny-trigger-manifest-invalid");
  if (trust.mode === "unconfigured") {
    if (Object.keys(trust).length !== 1) throw new TypeError("destiny-trigger-manifest-invalid");
  } else if (trust.mode === "dedicated-actor") {
    if (typeof trust.actorLogin !== "string" || trust.actorLogin.length < 1) throw new TypeError("destiny-trigger-manifest-invalid");
    if (trust.actorLogin === manifest.owner) throw new TypeError("destiny-trigger-actor-not-independent");
  } else if (trust.mode === "signed-receipt") {
    validateSignedReceiptTrust(trust, manifest.owner);
  } else {
    throw new TypeError("destiny-trigger-manifest-invalid");
  }
  return frozen({ ...manifest, receiptTrust: frozen({ ...trust }) });
}

function assertIndependentActor(manifest, actorLogin) {
  if (ownerAuthoredCommentCannotProveExecution(manifest.owner, actorLogin)) {
    throw new TypeError("destiny-trigger-receipt-owner-spoof");
  }
}

function assertSignedEvidence(manifest, evidence, publicKeySpki) {
  const trust = manifest.receiptTrust;
  if (typeof publicKeySpki !== "string") throw new TypeError("destiny-trigger-public-key-missing");
  const fingerprint = fingerprintPublicKeySpki(publicKeySpki);
  if (fingerprint !== trust.publicKeyFingerprint) throw new TypeError("destiny-trigger-public-key-mismatch");
  if (evidence.publicKeyFingerprint !== trust.publicKeyFingerprint) throw new TypeError("destiny-trigger-public-key-mismatch");
  if (!verifySignedPayload(publicKeySpki, canonicalWithoutSignature(evidence), evidence.signature)) {
    throw new TypeError("destiny-trigger-signature-invalid");
  }
}

export function evaluateDestinyTriggerReadiness(manifestInput, observationInput, { now = new Date().toISOString() } = {}) {
  const manifest = validateDestinyTriggerTrustManifest(manifestInput);
  const observation = observationInput == null ? null : requireObject(observationInput, "destiny-trigger-readiness-invalid");
  if (observation && (observation.schemaVersion !== 1 || !READY_STATES.has(observation.status) || !validDate(observation.observedAt))) throw new TypeError("destiny-trigger-readiness-invalid");
  if (manifest.receiptTrust.mode === "unconfigured") return frozen({ ready: false, reason: "destiny-trigger-identity-unconfigured", status: "not-configured" });
  if (!observation) throw new TypeError("destiny-trigger-readiness-invalid");
  if (observation.triggerId !== manifest.triggerId) return frozen({ ready: false, reason: "destiny-trigger-id-mismatch", status: observation.status });
  if (observation.repository !== manifest.repository) return frozen({ ready: false, reason: "destiny-trigger-repository-mismatch", status: observation.status });
  if (ownerAuthoredCommentCannotProveExecution(manifest.owner, observation.actorLogin)) {
    return frozen({ ready: false, reason: "destiny-trigger-receipt-owner-spoof", status: observation.status });
  }
  if (manifest.receiptTrust.mode === "dedicated-actor") {
    if (observation.actorLogin !== manifest.receiptTrust.actorLogin) return frozen({ ready: false, reason: "destiny-trigger-actor-mismatch", status: observation.status });
  } else {
    try {
      assertSignedEvidence(manifest, observation, observation.publicKeySpki);
    } catch (error) {
      const reason = error instanceof TypeError ? error.message : "destiny-trigger-signature-invalid";
      return frozen({ ready: false, reason, status: observation.status });
    }
    if (manifest.receiptTrust.keyId && observation.actorLogin && observation.actorLogin !== manifest.receiptTrust.keyId) {
      return frozen({ ready: false, reason: "destiny-trigger-actor-mismatch", status: observation.status });
    }
  }
  if (manifest.zeroCreditRequired && observation.zeroCreditEligible !== true) return frozen({ ready: false, reason: "destiny-trigger-zero-credit-not-eligible", status: observation.status });
  const age = Date.parse(now) - Date.parse(observation.observedAt);
  if (!Number.isFinite(age) || age < 0 || age > manifest.readinessMaxAgeMs) return frozen({ ready: false, reason: "destiny-trigger-readiness-stale", status: observation.status });
  if (observation.status !== "ready") return frozen({ ready: false, reason: `destiny-trigger-${observation.status}`, status: observation.status });
  return frozen({
    ready: true,
    reason: "ready",
    status: observation.status,
    observedAt: observation.observedAt,
    actorLogin: typeof observation.actorLogin === "string" ? observation.actorLogin : (manifest.receiptTrust.keyId ?? null),
    installationFingerprint: typeof observation.installationFingerprint === "string"
      ? observation.installationFingerprint
      : (manifest.receiptTrust.mode === "signed-receipt" ? manifest.receiptTrust.publicKeyFingerprint : null),
    zeroCreditEligible: true,
  });
}

export function validateDestinyTriggerReceipt(manifestInput, receiptInput) {
  const manifest = validateDestinyTriggerTrustManifest(manifestInput);
  if (manifest.receiptTrust.mode === "unconfigured") throw new TypeError("destiny-trigger-identity-unconfigured");
  const receipt = requireObject(receiptInput, "destiny-trigger-receipt-invalid");
  if (receipt.schemaVersion !== 1 || !RECEIPT_KINDS.has(receipt.kind)) throw new TypeError("destiny-trigger-receipt-invalid");
  if (receipt.repository !== manifest.repository) throw new TypeError("destiny-trigger-receipt-repository-mismatch");
  if (!Number.isSafeInteger(receipt.pullRequest) || receipt.pullRequest < 1) throw new TypeError("destiny-trigger-receipt-invalid");
  if (!DISPATCH_ID.test(receipt.dispatchId ?? "") || !SHA64.test(receipt.requestSha256 ?? "") || !SHA40.test(receipt.headSha ?? "")) throw new TypeError("destiny-trigger-receipt-invalid");
  if (typeof receipt.deliveryId !== "string" || receipt.deliveryId.length < 1 || receipt.deliveryId.length > 128) throw new TypeError("destiny-trigger-receipt-invalid");
  if (typeof receipt.status !== "string" || receipt.status.length < 1 || receipt.status.length > 64 || !validDate(receipt.observedAt)) throw new TypeError("destiny-trigger-receipt-invalid");
  assertIndependentActor(manifest, receipt.actorLogin);
  if (manifest.receiptTrust.mode === "dedicated-actor") {
    if (receipt.actorLogin !== manifest.receiptTrust.actorLogin) throw new TypeError("destiny-trigger-receipt-actor-mismatch");
  } else {
    assertSignedEvidence(manifest, receipt, receipt.publicKeySpki);
    if (manifest.receiptTrust.keyId && receipt.actorLogin && receipt.actorLogin !== manifest.receiptTrust.keyId) {
      throw new TypeError("destiny-trigger-receipt-actor-mismatch");
    }
  }
  return frozen({ ...receipt });
}

function assertCorrelation(correlation, receipt) {
  if (
    receipt.repository !== correlation.repository ||
    receipt.pullRequest !== correlation.pullRequest ||
    receipt.dispatchId !== correlation.dispatchId ||
    receipt.requestSha256 !== correlation.requestSha256 ||
    receipt.headSha !== correlation.headSha
  ) throw new TypeError("destiny-trigger-receipt-correlation-mismatch");
}

function transitionAllowed(state, kind) {
  if (kind === "rejected" || kind === "expired") return !TERMINAL_KINDS.has(state);
  if (state === "created") return kind === "acked" || kind === "running" || kind === "result";
  if (state === "acked") return kind === "running" || kind === "result";
  if (state === "running") return kind === "result";
  return false;
}

export function reduceDestinyReceiptLifecycle(manifestInput, correlationInput, receiptsInput, { now = new Date().toISOString() } = {}) {
  const manifest = validateDestinyTriggerTrustManifest(manifestInput);
  const correlation = requireObject(correlationInput, "destiny-trigger-correlation-invalid");
  if (correlation.repository !== manifest.repository || !Number.isSafeInteger(correlation.pullRequest) || !DISPATCH_ID.test(correlation.dispatchId ?? "") || !SHA64.test(correlation.requestSha256 ?? "") || !SHA40.test(correlation.headSha ?? "") || !validDate(correlation.createdAt)) throw new TypeError("destiny-trigger-correlation-invalid");
  if (!Array.isArray(receiptsInput)) throw new TypeError("destiny-trigger-receipts-invalid");
  if (!validDate(now)) throw new TypeError("destiny-trigger-now-invalid");

  const seen = new Map();
  let state = "created";
  let lastObservedAt = correlation.createdAt;
  let duplicatesSuppressed = 0;
  const accepted = [];

  for (const raw of receiptsInput) {
    const receipt = validateDestinyTriggerReceipt(manifest, raw);
    assertCorrelation(correlation, receipt);
    const prior = seen.get(receipt.deliveryId);
    if (prior) {
      if (!sameReceipt(prior, receipt)) throw new TypeError("destiny-trigger-receipt-delivery-conflict");
      duplicatesSuppressed += 1;
      continue;
    }
    if (TERMINAL_KINDS.has(state)) throw new TypeError("destiny-trigger-receipt-after-terminal");
    if (Date.parse(receipt.observedAt) < Date.parse(lastObservedAt)) throw new TypeError("destiny-trigger-receipt-out-of-order");
    if (!transitionAllowed(state, receipt.kind)) throw new TypeError("destiny-trigger-receipt-out-of-order");
    seen.set(receipt.deliveryId, receipt);
    accepted.push(receipt);
    state = receipt.kind;
    lastObservedAt = receipt.observedAt;
  }

  return frozen({
    state,
    acceptedReceipts: frozen(accepted),
    duplicatesSuppressed,
    lastObservedAt,
    evaluatedAt: now,
  });
}

export function summarizeDestinyTriggerHealth(manifestInput, readinessInput, lifecycleInput = null) {
  const manifest = validateDestinyTriggerTrustManifest(manifestInput);
  const readiness = requireObject(readinessInput, "destiny-trigger-readiness-summary-invalid");
  const actorFromTrust = manifest.receiptTrust.mode === "dedicated-actor"
    ? manifest.receiptTrust.actorLogin
    : (manifest.receiptTrust.mode === "signed-receipt" ? (manifest.receiptTrust.keyId ?? null) : null);
  return frozen({
    triggerId: manifest.triggerId,
    repository: manifest.repository,
    ready: readiness.ready === true,
    reason: readiness.reason ?? "unknown",
    actorLogin: readiness.actorLogin ?? actorFromTrust,
    installationFingerprint: readiness.installationFingerprint ?? (manifest.receiptTrust.publicKeyFingerprint ?? null),
    zeroCreditRequired: manifest.zeroCreditRequired,
    zeroCreditEligible: readiness.zeroCreditEligible === true,
    lifecycleState: lifecycleInput?.state ?? "created",
    duplicatesSuppressed: Number.isSafeInteger(lifecycleInput?.duplicatesSuppressed) ? lifecycleInput.duplicatesSuppressed : 0,
    lastObservedAt: lifecycleInput?.lastObservedAt ?? null,
    receiptTrustMode: manifest.receiptTrust.mode,
  });
}
