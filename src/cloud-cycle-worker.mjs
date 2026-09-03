import crypto from "node:crypto";
import { selectZeroCreditProvider } from "./zero-credit-provider-selector.mjs";

export const CLOUD_CYCLE_STATES = Object.freeze(["queued", "cloud-running", "local-running", "verifying", "waiting", "failed", "candidate-ready"]);
export const CLOUD_CYCLE_WORKFLOW_VERSION = "sovereign-eight-hour-cycle/v1";

export function getEightHourWindowStart(now = new Date()) {
  const date = new Date(now);
  date.setUTCMinutes(0, 0, 0);
  date.setUTCHours(Math.floor(date.getUTCHours() / 8) * 8);
  return date.toISOString();
}

export function createCycleId({ repositoryIdentity, windowStartUtc, workflowVersion = CLOUD_CYCLE_WORKFLOW_VERSION } = {}) {
  if (!repositoryIdentity || !windowStartUtc) throw new TypeError("repositoryIdentity and windowStartUtc are required.");
  return crypto.createHash("sha256").update(`${repositoryIdentity}|${windowStartUtc}|${workflowVersion}`).digest("hex");
}

export async function runCloudCycle({ repositoryIdentity, branch = "main", providers = [], requiresGeneration = true, cloudModeEnabled = true, client, providerSelector = selectZeroCreditProvider, now = new Date() } = {}) {
  const windowStartUtc = getEightHourWindowStart(now);
  const cycleId = createCycleId({ repositoryIdentity, windowStartUtc });
  const events = [event("queued", cycleId, branch)];
  let startedCodespaceName = null;
  try {
    const providerDecision = providerSelector({ providers, requiresGeneration, cloudModeEnabled });
    if (providerDecision.status === "waiting") {
      events.push(event("waiting", cycleId, branch, providerDecision.providerId));
      return result("waiting", cycleId, branch, events, providerDecision);
    }
    if (providerDecision.providerId === "codespaces-open-weight") {
      events.push(event("cloud-running", cycleId, branch));
      const startReceipt = client ? await client.start({ telemetry: providers.find((p) => p.id === "codespaces-open-weight") }) : { status: "prepared" };
      startedCodespaceName = startReceipt.codespaceName ?? null;
    } else {
      events.push(event("local-running", cycleId, branch));
    }
    events.push(event("verifying", cycleId, branch));
    events.push(event("candidate-ready", cycleId, branch));
    return result("candidate-ready", cycleId, branch, events, providerDecision);
  } catch (error) {
    events.push(event("failed", cycleId, branch, error.code || "cloud-cycle-error"));
    return result("failed", cycleId, branch, events, null);
  } finally {
    if (client && startedCodespaceName) await client.stop({ codespaceName: startedCodespaceName });
  }
}

function event(state, cycleId, branch, reason = null) {
  if (!CLOUD_CYCLE_STATES.includes(state)) throw new Error(`Invalid cloud cycle state: ${state}`);
  return Object.freeze({ state, cycleId, branch, reason, at: new Date().toISOString() });
}
function result(status, cycleId, branch, events, providerDecision) { return Object.freeze({ status, cycleId, branch, workflowVersion: CLOUD_CYCLE_WORKFLOW_VERSION, events, providerDecision }); }

if (import.meta.url === `file://${process.argv[1]}`) {
  const repositoryIdentity = process.env.GITHUB_REPOSITORY || "unknown/repository";
  const output = await runCloudCycle({ repositoryIdentity, providers: [], requiresGeneration: false, cloudModeEnabled: false });
  console.log(JSON.stringify(output));
}
