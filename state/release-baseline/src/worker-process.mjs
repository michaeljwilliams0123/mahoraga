import { loadManifest } from "./config.mjs";
import { applyAutomaticRepairs, scanRepairState } from "./repair.mjs";
import { executeBrowserCapability, shutdownBrowser } from "./browser-worker.mjs";
import { executeRepositoryCapability } from "./repository-worker.mjs";
import { executeMicrosoftQueueCapability } from "./microsoft-queue-worker.mjs";
import { executeCopilotCapability } from "./copilot-worker.mjs";
import { executeCodexBuilderCapability } from "./codex-builder-worker.mjs";

const workerId = process.argv[2];
if (!workerId || !process.send) process.exit(2);

const manifest = await loadManifest();
const worker = manifest.workers.find((item) => item.id === workerId && item.enabled);
if (!worker) process.exit(3);

process.send({ type: "ready", workerId, pid: process.pid, capabilities: worker.capabilities });
const heartbeat = setInterval(() => process.send?.({ type: "heartbeat", workerId, timestamp: new Date().toISOString() }), manifest.runtime.heartbeatIntervalMs);
heartbeat.unref();

process.on("message", async (message) => {
  if (message?.type === "shutdown") { clearInterval(heartbeat); shutdownBrowser(); process.exit(0); }
  if (message?.type !== "task") return;
  try {
    const result = await execute(message.capability, message.task);
    process.send?.({ type: "task.completed", workerId, taskId: message.taskId, result });
  } catch (error) {
    process.send?.({ type: "task.failed", workerId, taskId: message.taskId, errorCode: classifyError(error) });
  }
});

async function execute(capability, task) {
  if (capability.startsWith("browser.")) return executeBrowserCapability(capability, task);
  if (capability.startsWith("repository.")) return executeRepositoryCapability(capability, task);
  if (capability.startsWith("queue.")) return executeMicrosoftQueueCapability(capability);
  if (capability.startsWith("copilot.")) return executeCopilotCapability(capability, task, worker);
  if (capability.startsWith("codex.")) return executeCodexBuilderCapability(capability, task, worker);
  switch (capability) {
    case "assistant.respond":
      return {
        verified: true,
        summary: `I saved this assignment in our durable conversation: ${String(task?.requestedOutcome ?? "Continue the assignment").replace(/\s+/g, " ").trim().slice(0, 240)}. I will keep the context available while you are away.`,
      };
    case "system.health":
      return { verified: true, summary: `Mahoraga ${manifest.version} local runtime is responsive.`, version: manifest.version, phase: manifest.phase };
    case "manifest.validate":
      await loadManifest();
      return { verified: true, summary: "Canonical manifest passed validation.", workers: manifest.workers.length };
    case "repair.scan": {
      const scan = await scanRepairState(manifest);
      return { summary: scan.healthy ? `Offline repair baseline is healthy across ${scan.checked} essential files.` : `Offline repair scan found ${scan.issues.length} issue(s).`, ...scan };
    }
    case "repair.apply":
      return applyAutomaticRepairs(manifest);
    default:
      throw new Error("unsupported-capability");
  }
}

function classifyError(error) {
  if (error?.message === "unsupported-capability") return "unsupported-capability";
  if (error?.code === "ENOENT") return "required-file-missing";
  if (/browser/i.test(error?.message ?? "")) return "browser-verification-failed";
  if (/repository/i.test(error?.message ?? "")) return "repository-verification-failed";
  if (/copilot/i.test(error?.message ?? "")) return "copilot-provider-failed";
  if (/codex/i.test(error?.message ?? "")) return "codex-builder-unavailable";
  return "worker-execution-failed";
}

process.on("exit", shutdownBrowser);
