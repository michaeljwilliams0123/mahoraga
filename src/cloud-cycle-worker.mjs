import crypto from "node:crypto";
import { selectZeroCreditProvider } from "./zero-credit-provider-selector.mjs";
import { getAnchoredFourHourWindowStart } from "./sovereign-cycle-clock.mjs";

export const CLOUD_CYCLE_STATES = Object.freeze(["queued", "cloud-running", "local-running", "verifying", "waiting", "failed", "no-candidate", "candidate-ready"]);
export const CLOUD_CYCLE_WORKFLOW_VERSION = "sovereign-four-hour-cycle/v1";

export function getFourHourWindowStart(now = new Date(), anchorAtUtc = null) {
  if (anchorAtUtc) return getAnchoredFourHourWindowStart(now, anchorAtUtc);
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

export async function runCloudCycle({ repositoryIdentity, branch = "main", providers = [], requiresGeneration = true, cloudModeEnabled = true, client, providerSelector = selectZeroCreditProvider, candidateProducer = null, now = new Date(), anchorAtUtc = null } = {}) {
  const windowStartUtc = getFourHourWindowStart(now, anchorAtUtc);
  if (!windowStartUtc) {
    return Object.freeze({
      status: "waiting",
      cycleId: null,
      branch,
      workflowVersion: CLOUD_CYCLE_WORKFLOW_VERSION,
      events: [],
      providerDecision: null,
      candidate: null,
      terminalReason: "cadence-anchor-not-reached",
      terminalStage: null,
      terminalDetail: null,
      windowStartUtc: null,
    });
  }
  const cycleId = createCycleId({ repositoryIdentity, windowStartUtc });
  const events = [event("queued", cycleId, branch)];
  let startedCodespace = false;
  try {
    const providerDecision = providerSelector({ providers, requiresGeneration, cloudModeEnabled });
    if (providerDecision.status === "waiting") {
      const terminalReason = providerDecision.providerId ?? "provider-unavailable";
      events.push(event("waiting", cycleId, branch, terminalReason));
      return result("waiting", cycleId, branch, events, providerDecision, { terminalReason, windowStartUtc });
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
      return result("no-candidate", cycleId, branch, events, providerDecision, { terminalReason, windowStartUtc });
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
      return result("no-candidate", cycleId, branch, events, providerDecision, { terminalReason, windowStartUtc });
    }

    const candidate = validateCandidateReceipt(produced);
    const terminalReason = "candidate-produced";
    events.push(event("candidate-ready", cycleId, branch, terminalReason));
    return result("candidate-ready", cycleId, branch, events, providerDecision, { candidate, terminalReason, windowStartUtc });
  } catch (error) {
    const terminalReason = safeReason(error?.code) || "cloud-cycle-error";
    const terminalStage = safeStage(error?.stage);
    const terminalDetail = safeDetail(error?.publicDetail);
    events.push(event("failed", cycleId, branch, terminalReason));
    return result("failed", cycleId, branch, events, null, { terminalReason, terminalStage, terminalDetail, windowStartUtc });
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

function safeReason(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value) ? value : null;
}

function safeStage(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value) ? value : null;
}

function safeDetail(value) {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return normalized.length > 0 && normalized.length <= 400 ? normalized : null;
}

function event(state, cycleId, branch, reason = null) {
  if (!CLOUD_CYCLE_STATES.includes(state)) throw new Error(`Invalid cloud cycle state: ${state}`);
  return Object.freeze({ state, cycleId, branch, reason, at: new Date().toISOString() });
}

function result(status, cycleId, branch, events, providerDecision, { candidate = null, terminalReason = null, terminalStage = null, terminalDetail = null, windowStartUtc = null } = {}) {
  return Object.freeze({ status, cycleId, branch, workflowVersion: CLOUD_CYCLE_WORKFLOW_VERSION, events, providerDecision, candidate, terminalReason, terminalStage, terminalDetail, windowStartUtc });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const repositoryIdentity = process.env.GITHUB_REPOSITORY || "unknown/repository";
  const anchorAtUtc = process.env.MAHORAGA_CYCLE_ANCHOR_UTC || null;
  let candidateProducer = null;
  if (process.env.MAHORAGA_CANDIDATE_PRODUCER === "github-native") {
    const { createGitHubNativeCandidateProducer } = await import("./sovereign-candidate-producer.mjs");
    candidateProducer = createGitHubNativeCandidateProducer();
  }
  const output = await runCloudCycle({ repositoryIdentity, providers: [], requiresGeneration: false, cloudModeEnabled: false, anchorAtUtc, candidateProducer });
  console.log(JSON.stringify(output));
  if (output.status === "failed") process.exitCode = 1;
}
