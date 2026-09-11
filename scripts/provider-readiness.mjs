import { loadManifest } from "../src/config.mjs";
import { executeDesktopCapability } from "../src/desktop-worker.mjs";
import { executeMicrosoftQueueCapability } from "../src/microsoft-queue-worker.mjs";
import { probeLocalReasoner } from "../src/local-reasoner-provider.mjs";
import { executeCopilotCapability } from "../src/copilot-worker.mjs";
import { executeCodexBuilderCapability } from "../src/codex-builder-worker.mjs";
import { executeWorkspaceAgentCapability } from "../src/workspace-agent-worker.mjs";
import { executeMicrosoft365Capability } from "../src/microsoft365-worker.mjs";
import { executePowerPlatformCapability } from "../src/power-platform-worker.mjs";
import { executeGoogleWorkspaceCapability } from "../src/google-workspace-worker.mjs";
import { executeSignedChromeCapability } from "../src/signed-chrome-worker.mjs";
import { collectProviderReadiness } from "../src/provider-readiness.mjs";

const manifest = await loadManifest();
const worker = (id) => manifest.workers.find((item) => item.id === id);

const report = await collectProviderReadiness({
  desktop: () => executeDesktopCapability("desktop.inspect"),
  powerPlatform: () => executePowerPlatformCapability("powerplatform.health", {}, worker("power-platform")),
  microsoft365: () => executeMicrosoft365Capability("m365.health", {}, worker("microsoft365")),
  signedChrome: () => executeSignedChromeCapability("chrome.health", {}, worker("signed-chrome")),
  googleWorkspace: () => executeGoogleWorkspaceCapability("google.health", {}, worker("google-workspace")),
  microsoftQueue: () => executeMicrosoftQueueCapability("queue.status"),
  localReasoner: () => probeLocalReasoner(),
  githubCopilot: () => executeCopilotCapability("copilot.health", {}, worker("github-copilot")),
  primaryCodexBuilder: () => executeCodexBuilderCapability("codex.health", {}, worker("primary-codex-builder")),
  workspaceAgent: () => executeWorkspaceAgentCapability("workspace-agent.health", {}, worker("workspace-agent-cloud")),
});

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
