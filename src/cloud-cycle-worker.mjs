import crypto from "node:crypto";
import { selectZeroCreditProvider } from "./zero-credit-provider-selector.mjs";

export const CLOUD_CYCLE_STATES = Object.freeze(["queued", "cloud-running", "local-running", "verifying", "waiting", "failed", "no-candidate", "candidate-ready"]);
export const CLOUD_CYCLE_WORKFLOW_VERSION = "sovereign-four-hour-cycle/v1";

export function getFourHourWindowStart(now = new Date()) {
  const date = new Date(now);
  date.setUTCMinutes(0, 0, 0);
  date.setUTCHours(Math.floor(date.getUTCHours() / 4) * 4);
  return date.toISOString();
}

export function createCycleId({ repositoryIdentity, windowStartUtc, workflowVersion = CLOUD_CYCLE_WORKFLOW_VERSION } = {}) {
  if (!repositoryIdentity || !windowStartUtc) throw new TypeError("repositoryIdentity and windowStartUtc are required.");
  return crypto.createHash("sha256").update(`${repositoryIdentity}|${windowStartUtc}|${workflowVersion}`).digest("hex");
}

export function validateCandidateReceipt(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("candidate receipt is required");
  const baseSha = exactSha(value.baseSha, "candidate base SHA");
  const headSha = exactSha(value.headSha, "candidate head SHA");
  if (headSha === baseSha) throw new TypeError("candidate head must differ from base");
  const branch = boundedBranch(value.branch);
  const pullRequestNumber = Number(value.pullRequestNumber);
  if (!Number.isSafeInteger(pullRequestNumber) || pullRequestNumber < 1) throw new TypeError("candidate pull request number is invalid");
  const changedFilesDigest = typeof value.changedFilesDigest === "string" && /^[a-f0-9]{64}$/.test(value.changedFilesDigest)
    ? value.changedFilesDigest
    : null;
  if (!changedFilesDigest) throw new TypeError("candidate changed-files digest is invalid");
  return Object.freeze({ baseSha, headSha, branch, pullRequestNumber, changedFilesDigest });
}

export async function runCloudCycle({ repositoryIdentity, branch = "main", providers = [], requiresGeneration = true, cloudModeEnabled = true, client, providerSelector = selectZeroCreditProvider, candidateProducer = null, now = new Date() } = {}) {
  const windowStartUtc = getFourHourWindowStart(now);
  const cycleId = createCycleId({ repositoryIdentity, windowStartUtc });
  const events = [event("queued", cycleId, branch)];
  let startedCodespace = false;
  try {
    const providerDecision = providerSelector({ providers, requiresGeneration, cloudModeEnabled });
    if (providerDecision.status === "waiting") {
      const terminalReason = providerDecision.providerId ?? "provider-unavailable";
      events.push(event("waiting", cycleId, branch, terminalReason));
      return result("waiting", cycleId, branch, events, providerDecision, { terminalReason });
    }
    if (providerDecision.providerId === "codespaces-open-weight") {
      events.push(event("cloud-running", cycleId, branch));
      const startReceipt = client ? await client.start({ telemetry: providers.find((p) => p.id === "codespaces-open-weight") }) : { status: "prepared" };
      startedCodespace = startReceipt.status === "ok";
    } else {
      events.push(event("local-running", cycleId, branch));
    }
    events.push(event("verifying", cycleId, branch));

    if (candidateProducer === null) {
      const terminalReason = "candidate-producer-unavailable";
      events.push(event("no-candidate", cycleId, branch, terminalReason));
      return result("no-candidate", cycleId, branch, events, providerDecision, { terminalReason });
    }
    if (typeof candidateProducer !== "function") throw new TypeError("candidate producer is invalid");

    const produced = await candidateProducer(Object.freeze({
      repositoryIdentity,
      branch,
      cycleId,
      windowStartUtc,
      providerDecision,
    }));
    if (produced == null) {
      const terminalReason = "no-actionable-work";
      events.push(event("no-candidate", cycleId, branch, terminalReason));
      return result("no-candidate", cycleId, branch, events, providerDecision, { terminalReason });
    }

    const candidate = validateCandidateReceipt(produced);
    const terminalReason = "candidate-produced";
    events.push(event("candidate-ready", cycleId, branch, terminalReason));
    return result("candidate-ready", cycleId, branch, events, providerDecision, { candidate, terminalReason });
  } catch (error) {
    const terminalReason = error.code || "cloud-cycle-error";
    events.push(event("failed", cycleId, branch, terminalReason));
    return result("failed", cycleId, branch, events, null, { terminalReason });
  } finally {
    if (client && startedCodespace) await client.stopActive();
  }
}

function exactSha(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{40}$/.test(value)) throw new TypeError(`${label} is invalid`);
  return value;
}

function boundedBranch(value) {
  if (typeof value !== "string" || value.length < 3 || value.length > 160 || value.includes("..") || value.includes("//") ||
      !/^(?:feature|upgrade|codex|destiny|secondary)\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)) {
    throw new TypeError("candidate branch is invalid");
  }
  return value;
}

function event(state, cycleId, branch, reason = null) {
  if (!CLOUD_CYCLE_STATES.includes(state)) throw new Error(`Invalid cloud cycle state: ${state}`);
  return Object.freeze({ state, cycleId, branch, reason, at: new Date().toISOString() });
}

function result(status, cycleId, branch, events, providerDecision, { candidate = null, terminalReason = null } = {}) {
  return Object.freeze({ status, cycleId, branch, workflowVersion: CLOUD_CYCLE_WORKFLOW_VERSION, events, providerDecision, candidate, terminalReason });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repositoryIdentity = process.env.GITHUB_REPOSITORY || "unknown/repository";
  const output = await runCloudCycle({ repositoryIdentity, providers: [], requiresGeneration: false, cloudModeEnabled: false });
  console.log(JSON.stringify(output));
}
