import { createHash } from "node:crypto";

const OBSERVATION_KEYS = new Set([
  "schemaVersion", "kind", "eventName", "action", "repository", "repositoryId", "senderLogin", "senderId",
  "githubAppSlug", "githubAppId", "installationId", "pullRequest", "issueNumber", "deliveryId", "fingerprint",
]);

export function observeGithubTransportIdentity(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) fail("github-transport-observation-invalid");
  const observation = {
    schemaVersion: 1,
    kind: "github-transport-observation",
    eventName: token(input.eventName, 64, "github-transport-observation-invalid"),
    action: nullableToken(input.action ?? null, 64, "github-transport-observation-invalid"),
    repository: repository(input.repository),
    repositoryId: nullableInteger(input.repositoryId ?? null, 0, Number.MAX_SAFE_INTEGER, "github-transport-observation-invalid"),
    senderLogin: token(input.senderLogin, 64, "github-transport-observation-invalid"),
    senderId: nullableInteger(input.senderId ?? null, 0, Number.MAX_SAFE_INTEGER, "github-transport-observation-invalid"),
    githubAppSlug: nullableToken(input.githubAppSlug ?? null, 64, "github-transport-observation-invalid"),
    githubAppId: nullableInteger(input.githubAppId ?? null, 1, Number.MAX_SAFE_INTEGER, "github-transport-observation-invalid"),
    installationId: nullableInteger(input.installationId ?? null, 1, Number.MAX_SAFE_INTEGER, "github-transport-observation-invalid"),
    pullRequest: nullableInteger(input.pullRequest ?? null, 1, Number.MAX_SAFE_INTEGER, "github-transport-observation-invalid"),
    issueNumber: nullableInteger(input.issueNumber ?? null, 1, Number.MAX_SAFE_INTEGER, "github-transport-observation-invalid"),
    deliveryId: nullableText(input.deliveryId ?? null, 128, "github-transport-observation-invalid"),
  };
  const fingerprint = digest(canonical(observation));
  return deepFreeze({ ...observation, fingerprint });
}

export function validateGithubTransportIdentity(value) {
  exact(value, OBSERVATION_KEYS, "github-transport-observation-invalid");
  const normalized = observeGithubTransportIdentity(value);
  if (value.fingerprint !== normalized.fingerprint) fail("github-transport-observation-fingerprint-invalid");
  return normalized;
}

export function transportMatchesGithubApp(observationInput, transport = {}) {
  const observation = validateGithubTransportIdentity(observationInput);
  if (!transport || typeof transport !== "object" || Array.isArray(transport)) fail("github-transport-observation-invalid");
  const slugMatches = transport.githubAppSlug == null || observation.githubAppSlug === transport.githubAppSlug;
  const idMatches = transport.githubAppId == null || observation.githubAppId === transport.githubAppId;
  return slugMatches && idMatches;
}

function repository(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) fail("github-transport-observation-invalid");
  return value;
}
function token(value, max, code) {
  if (typeof value !== "string" || value.length < 1 || value.length > max || !/^[A-Za-z0-9_.\[\]-]+$/.test(value)) fail(code);
  return value;
}
function nullableToken(value, max, code) { return value === null ? null : token(value, max, code); }
function nullableText(value, max, code) {
  if (value === null) return null;
  if (typeof value !== "string" || value.length < 1 || value.length > max || /[\0\r\n]/.test(value)) fail(code);
  return value;
}
function nullableInteger(value, min, max, code) {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < min || value > max) fail(code);
  return value;
}
function exact(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== keys.size || Object.keys(value).some((key) => !keys.has(key))) fail(code);
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function digest(value) { return createHash("sha256").update(value, "utf8").digest("hex"); }
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
