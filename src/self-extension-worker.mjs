import { createChildAgentManifest } from "./agent-foundry.mjs";
import { executeCodexBuilderCapability } from "./codex-builder-worker.mjs";

const SELF_EXTENSION_CAPABILITIES = new Set(["code.create-test", "self.patch", "self.enhance", "agent.replicate"]);
const AGENT_REGISTRY_PATH = "coordination/agent-factory/registry.json";

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

export async function executeSelfExtensionCapability(capability, task, worker, dependencies = {}) {
  if (!SELF_EXTENSION_CAPABILITIES.has(capability)) fail("unsupported-capability");
  const executeBuilder = dependencies.executeBuilder ?? ((nextCapability, nextTask, nextWorker) => executeCodexBuilderCapability(nextCapability, nextTask, nextWorker, dependencies.builderDependencies ?? dependencies));
  const allowedPaths = Array.isArray(task?.allowedPaths) ? [...task.allowedPaths] : [];
  const leasePaths = Array.isArray(task?.integrationLease?.paths) ? task.integrationLease.paths : allowedPaths;

  let requestedOutcome;
  let childManifest = null;
  if (capability === "agent.replicate") {
    const authorized = leasePaths.includes(AGENT_REGISTRY_PATH) && allowedPaths.includes(AGENT_REGISTRY_PATH);
    if (!authorized) fail("agent-registry-path-not-authorized");
    const createChildManifest = dependencies.createChildManifest ?? ((spec) => createChildAgentManifest({
      agentId: spec.agentId,
      parentAgentId: spec.parentAgentId ?? "mahoraga-steward",
      role: spec.role ?? "capability-specialist",
      mission: spec.mission ?? "Provide a bounded Mahoraga capability through existing architecture.",
      capabilities: spec.capabilities ?? [],
      privileges: spec.privileges ?? ["github-read"],
    }));
    childManifest = createChildManifest(task?.agentSpec ?? {});
    requestedOutcome = [
      task?.requestedOutcome ?? "",
      "Use the existing Agent Foundry manifest contract and current Mahoraga architecture.",
      `Register ${childManifest.agentId} idempotently and preserve every existing registry entry.`,
      `Child manifest: ${JSON.stringify(childManifest)}`,
      "Do not delete or rename existing files, agents, UI, auth, workflows, workers, or architecture.",
      "Do not add a paid or metered API fallback. Run relevant tests and leave only a bounded candidate for normal integration.",
    ].join(" ").trim();
  } else {
    const objective = task?.requestedOutcome ?? "";
    const lane = capability === "code.create-test"
      ? "Create or modify only the bounded code needed for the objective and run relevant tests."
      : capability === "self.patch"
        ? "Patch the bounded defect using the existing architecture and run relevant tests."
        : "Enhance the bounded capability by composing the existing architecture and run relevant tests.";
    requestedOutcome = [
      objective,
      lane,
      "Enhance rather than replace. Do not delete or rename existing files.",
      "Preserve existing UI, auth, workflows, workers, provider boundaries, and zero-credit behavior unless the task explicitly and validly bounds one of those paths.",
      "Do not add paid or metered provider fallback. Work only inside the existing disposable execution cell and allowed paths.",
    ].join(" ").trim();
  }

  const result = await executeBuilder("codex.execute", deriveTask(task, allowedPaths, requestedOutcome), worker);
  return {
    ...result,
    selfExtension: {
      capability,
      preservationMode: "additive-no-delete-rename",
      delegatedTo: "primary-codex-builder",
      networkAccess: false,
      meteredOpenAiApi: false,
      childAgentId: childManifest?.agentId ?? null,
    },
  };
}

function deriveTask(task, allowedPaths, requestedOutcome) {
  return {
    ...task,
    allowedPaths,
    requestedOutcome,
    preserveBaseline: true,
    baseCommit: task?.baseCommit,
    integrationLeaseId: task?.integrationLeaseId,
    integrationLease: task?.integrationLease,
  };
}
