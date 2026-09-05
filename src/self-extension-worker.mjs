import { createChildAgentManifest } from "./agent-foundry.mjs";
import { executeCodexBuilderCapability } from "./codex-builder-worker.mjs";

const SELF_EXTENSION_CAPABILITIES = new Set(["code.create-test", "self.patch", "self.enhance", "agent.replicate"]);
const AGENT_REGISTRY_PATH = "coordination/agent-factory/registry.json";

export async function executeSelfExtensionCapability(capability, task, worker, dependencies = {}) {
  if (!SELF_EXTENSION_CAPABILITIES.has(capability)) {
    const error = new Error("unsupported-capability");
    error.code = "unsupported-capability";
    throw error;
  }
  const executeBuilder = dependencies.executeBuilder ?? ((nextCapability, nextTask, nextWorker) => executeCodexBuilderCapability(nextCapability, nextTask, nextWorker, dependencies));
  const allowedPaths = Array.isArray(task?.allowedPaths) ? [...task.allowedPaths] : [];
  const leasePaths = Array.isArray(task?.integrationLease?.paths) ? task.integrationLease.paths : allowedPaths;

  if (capability === "agent.replicate") {
    const authorized = leasePaths.includes(AGENT_REGISTRY_PATH) && allowedPaths.includes(AGENT_REGISTRY_PATH);
    if (!authorized) {
      throw Object.assign(new Error("agent-registry-path-not-authorized"), { code: "agent-registry-path-not-authorized" });
    }
    const createChildManifest = dependencies.createChildManifest ?? ((spec) => createChildAgentManifest({
      agentId: spec.agentId,
      parentAgentId: spec.parentAgentId ?? "mahoraga-steward",
      role: spec.role ?? "artifact-builder",
      mission: spec.mission ?? "Create bounded artifacts.",
      capabilities: spec.capabilities ?? ["artifact-create"],
      privileges: spec.privileges ?? ["github-read"],
    }));
    const manifest = createChildManifest(task.agentSpec ?? {});
    const requestedOutcome = [
      task.requestedOutcome ?? "",
      "Use the existing Agent Foundry manifest contract.",
      `Register ${manifest.agentId} additively.`,
      "Do not delete or rename existing agents or architecture.",
    ].join(" ");
    return executeBuilder("codex.execute", deriveTask(task, allowedPaths, requestedOutcome), worker);
  }

  const extra = capability === "code.create-test"
    ? "Run relevant tests. Do not delete or rename existing files."
    : "Preserve the existing architecture. Do not delete or rename files.";
  const requestedOutcome = `${task.requestedOutcome ?? ""} ${extra}`.trim();
  return executeBuilder("codex.execute", deriveTask(task, allowedPaths, requestedOutcome), worker);
}

function deriveTask(task, allowedPaths, requestedOutcome) {
  return {
    ...task,
    allowedPaths,
    requestedOutcome,
    preserveBaseline: true,
    baseCommit: task.baseCommit,
    integrationLeaseId: task.integrationLeaseId,
    integrationLease: task.integrationLease,
  };
}
