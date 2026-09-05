import path from "node:path";
import { loadManifest, ROOT } from "./config.mjs";
import { applyAutomaticRepairs, scanRepairState } from "./repair.mjs";
import { executeBrowserCapability, shutdownBrowser } from "./browser-worker.mjs";
import { executeRepositoryCapability } from "./repository-worker.mjs";
import { executeMicrosoftQueueCapability } from "./microsoft-queue-worker.mjs";
import { executeCopilotCapability } from "./copilot-worker.mjs";
import { executeCodexBuilderCapability } from "./codex-builder-worker.mjs";
import { executeArtifactAuthoringCapability } from "./artifact-authoring.mjs";
import { executeSelfExtensionCapability } from "./self-extension-worker.mjs";
import { executeWorkspaceAgentCapability } from "./workspace-agent-worker.mjs";
import { executeDesktopCapability } from "./desktop-worker.mjs";
import { executeMicrosoft365Capability } from "./microsoft365-worker.mjs";
import { inspectTaskArtifacts, LocalArtifactStore } from "./local-artifact-store.mjs";
import { createCapabilityReceipt } from "./receipt-registry.mjs";
import { createContentVault } from "./content-vault.mjs";
import { executeQuestionModel, probeQuestionModel } from "./question-model.mjs";

const workerId = process.argv[2];
if (!workerId || !process.send) process.exit(2);

const manifest = await loadManifest();
let artifactStorePromise = null;
const worker = manifest.workers.find((item) => item.id === workerId && item.enabled);
if (!worker) process.exit(3);

process.send({ type: "process.ready", workerId, pid: process.pid, capabilities: worker.capabilities });
const heartbeat = setInterval(() => process.send?.({ type: "heartbeat", workerId, timestamp: new Date().toISOString() }), manifest.runtime.heartbeatIntervalMs);
heartbeat.unref();

process.on("message", async (message) => {
  if (message?.type === "shutdown") { clearInterval(heartbeat); shutdownBrowser(); process.exit(0); }
  if (message?.type !== "task") return;
  try {
    const startedAt = Date.now();
    const result = await execute(message.capability, message.task);
    const receipt = createCapabilityReceipt(message.capability, result, { durationMs: Date.now() - startedAt });
    process.send?.({ type: "task.completed", workerId, taskId: message.taskId, result: { ...result, receipt } });
  } catch (error) {
    process.send?.({ type: "task.failed", workerId, taskId: message.taskId, errorCode: classifyError(error) });
  }
});

void probeProviderReadiness();

async function probeProviderReadiness() {
  let providerReady = false;
  const observedAt = new Date().toISOString();
  const startedAt = Date.now();
  try {
    const result = await execute(worker.healthProbe, { id: `startup-probe-${workerId}`, requestedOutcome: `Verify ${worker.label}` });
    const receipt = createCapabilityReceipt(worker.healthProbe, result, { observedAt, durationMs: Date.now() - startedAt });
    process.send?.({ type: "provider.readiness", workerId, capability: worker.healthProbe, receipt, observedAt });
    providerReady = receipt.outcome === "succeeded";
  } catch (error) {
    process.send?.({ type: "provider.readiness", workerId, capability: worker.healthProbe, receipt: null, observedAt, errorCode: classifyError(error) });
  }
  if (providerReady) await probeCapabilityCanaries();
  process.send?.({ type: "readiness.complete", workerId, observedAt: new Date().toISOString() });
}

async function probeCapabilityCanaries() {
  for (const capability of worker.capabilities) {
    const canaryMode = worker.capabilityCanaries[capability];
    if (canaryMode === "health" || capability === worker.healthProbe) continue;
    const observedAt = new Date().toISOString();
    const startedAt = Date.now();
    try {
      let result;
      if (canaryMode === "provider-derived") {
        result = {
          verified: true,
          summary: `${capability} inherits verified readiness from ${worker.healthProbe} without exercising a side effect.`,
          providerHealth: { canaryMode, sourceCapability: worker.healthProbe },
        };
      } else {
        result = capability === "artifact.inspect"
          ? await artifactInspectionCanary()
          : await execute(capability, { id: `startup-canary-${workerId}`, requestedOutcome: `Verify ${capability} without external content.` });
      }
      const receipt = createCapabilityReceipt(capability, result, { observedAt, durationMs: Date.now() - startedAt });
      process.send?.({ type: "capability.canary", workerId, capability, receipt, observedAt });
    } catch (error) {
      process.send?.({ type: "capability.canary", workerId, capability, receipt: null, observedAt, errorCode: classifyError(error) });
    }
  }
}

async function artifactInspectionCanary() {
  await artifactStoreForWorker();
  return { verified: true, summary: "Artifact inspection dependencies are available.", providerHealth: { storage: "ready" } };
}

async function execute(capability, task) {
  if (capability.startsWith("browser.")) return executeBrowserCapability(capability, task);
  if (capability.startsWith("repository.")) return executeRepositoryCapability(capability, task);
  if (capability.startsWith("queue.")) return executeMicrosoftQueueCapability(capability);
  if (capability.startsWith("copilot.")) return executeCopilotCapability(capability, task, worker);
  if (capability.startsWith("codex.")) return executeCodexBuilderCapability(capability, task, worker);
  if (capability === "artifact.create") return executeArtifactAuthoringCapability(capability, task, { store: await artifactStoreForWorker() });
  if (capability === "code.create-test" || capability === "self.patch" || capability === "self.enhance" || capability === "agent.replicate") return executeSelfExtensionCapability(capability, task, worker);
  if (capability.startsWith("workspace-agent.")) return executeWorkspaceAgentCapability(capability, task, worker);
  if (capability.startsWith("desktop.")) return executeDesktopCapability(capability, task);
  if (capability.startsWith("m365.")) return executeMicrosoft365Capability(capability, task, worker);
  switch (capability) {
    case "assistant.health":
      return probeQuestionModel();
    case "assistant.respond":
      return executeQuestionModel({ task });
    case "provider.gap":
      return {
        verified: true,
        outcome: "provider-unavailable",
        provider: "microsoft365",
        summary: "Mahoraga kept this enterprise request local and recorded a provider gap. The Microsoft 365 execution provider is not enabled; attach a local copy for private inspection or activate an approved Microsoft provider before retrying the link.",
      };

    case "artifact.inspect":
      return inspectTaskArtifacts(task, { store: await artifactStoreForWorker() });
    case "system.health":
      return { verified: true, summary: `Mahoraga ${manifest.version} local runtime is responsive.`, version: manifest.version, phase: manifest.phase };
    case "manifest.validate":
      await loadManifest();
      return { verified: true, summary: "Canonical manifest passed validation.", workers: manifest.workers.length };
    case "repair.scan": {
      const scan = await scanRepairState(manifest);
      return { verified: scan.healthy, summary: scan.healthy ? `Offline repair baseline is healthy across ${scan.checked} essential files.` : `Offline repair scan found ${scan.issues.length} issue(s).`, ...scan };
    }
    case "repair.apply":
      return applyAutomaticRepairs(manifest);
    default:
      throw new Error("unsupported-capability");
  }
}

function artifactStoreForWorker() {
  if (!artifactStorePromise) artifactStorePromise = (async () => {
    const artifactRoot = process.env.MAHORAGA_ARTIFACT_ROOT ?? path.join(ROOT, "state", "artifacts");
    const stateRoot = path.dirname(artifactRoot);
    const contentVault = await createContentVault({
      root: process.env.MAHORAGA_CONTENT_VAULT_ROOT ?? path.join(stateRoot, "content-vault"),
      keyFile: process.env.MAHORAGA_CONTENT_VAULT_KEY_FILE ?? path.join(stateRoot, "content-vault.key.dpapi"),
    });
    return new LocalArtifactStore(artifactRoot, { contentVault });
  })();
  return artifactStorePromise;
}

function classifyError(error) {
  if (error?.message === "unsupported-capability") return "unsupported-capability";
  if (error?.code === "ENOENT") return "required-file-missing";
  if (/browser/i.test(error?.message ?? "")) return "browser-verification-failed";
  if (/repository/i.test(error?.message ?? "")) return "repository-verification-failed";
  if (/microsoft-queue|dataverse/i.test(error?.message ?? "")) return "microsoft-queue-provider-failed";
  if (/m365|microsoft 365/i.test(error?.message ?? "")) return "microsoft365-provider-failed";
  if (/desktop/i.test(error?.message ?? "")) return "desktop-provider-failed";
  if (/copilot/i.test(error?.message ?? "")) return "copilot-provider-failed";
  if (/codex/i.test(error?.message ?? "")) return "codex-builder-unavailable";
  if (/workspace-agent/i.test(error?.message ?? "")) return "workspace-agent-provider-failed";
  return "worker-execution-failed";
}

process.on("exit", shutdownBrowser);
