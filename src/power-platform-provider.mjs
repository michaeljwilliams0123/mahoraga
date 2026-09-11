import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createCopilotHarnessDescriptor } from "./copilot-harness-descriptor.mjs";

const execFileAsync = promisify(execFile);

async function defaultRunPac(command, args, options) {
  if (command !== "pac.cmd") throw new TypeError("power-platform-pac-command-invalid");
  const authList = args.length === 2 && args[0] === "auth" && args[1] === "list";
  const copilotList = args.length === 2 && args[0] === "copilot" && args[1] === "list";
  if (!authList && !copilotList) throw new TypeError("power-platform-pac-operation-invalid");
  if (process.platform === "win32") {
    return authList
      ? execFileAsync("cmd.exe", ["/d", "/s", "/c", "pac.cmd", "auth", "list"], options)
      : execFileAsync("cmd.exe", ["/d", "/s", "/c", "pac.cmd", "copilot", "list"], options);
  }
  return authList
    ? execFileAsync("pac", ["auth", "list"], options)
    : execFileAsync("pac", ["copilot", "list"], options);
}
const LOGICAL_AGENTS = Object.freeze([
  Object.freeze({ displayName: "General Mahoraga", alias: "general-mahoraga" }),
  Object.freeze({ displayName: "Mahoraga Enterprise Core", alias: "enterprise-core" }),
  Object.freeze({ displayName: "Mahoraga Tenant Health Reader", alias: "tenant-health-reader" }),
]);
const PAC_OPTIONS = Object.freeze({ windowsHide: true, timeout: 20000, maxBuffer: 128 * 1024 });

export async function discoverPowerPlatformAgents({ runPac = defaultRunPac, harnessMetadataByAlias = {}, now = () => new Date().toISOString() } = {}) {
  if (!isRecord(harnessMetadataByAlias)) throw new TypeError("power-platform-harness-metadata-invalid");
  const { stdout } = await runPac("pac.cmd", ["copilot", "list"], PAC_OPTIONS);
  const text = String(stdout ?? "");
  const observedAt = now();
  return Object.freeze(LOGICAL_AGENTS.flatMap(({ displayName, alias }) => {
    const line = text.split(/\r?\n/).find((item) => item.trimStart().startsWith(displayName));
    if (!line) return [];
    const published = /\bPublished\b/i.test(line);
    const active = /\bActive\b/i.test(line);
    const provisioned = /\bProvisioned\b/i.test(line);
    const metadata = Object.hasOwn(harnessMetadataByAlias, alias) ? harnessMetadataByAlias[alias] : null;
    return [Object.freeze({
      alias,
      published,
      active,
      provisioned,
      harnessDescriptor: descriptorForAgent({ alias, published, active, provisioned, metadata, observedAt }),
    })];
  }));
}

export async function probePowerPlatformProvider({ runPac = defaultRunPac, platform = process.platform } = {}) {
  if (platform !== "win32") return unavailable(false);
  try {
    const [{ stdout: authOut }, agents] = await Promise.all([
      runPac("pac.cmd", ["auth", "list"], PAC_OPTIONS),
      discoverPowerPlatformAgents({ runPac }),
    ]);
    const authenticated = /^\s*\[\d+\]\s+\*/m.test(String(authOut ?? "")) && /OperatingSystem/i.test(String(authOut ?? ""));
    const publishedAgentCount = agents.filter((item) => item.published).length;
    const activeAgentCount = agents.filter((item) => item.active).length;
    const provisionedAgentCount = agents.filter((item) => item.provisioned).length;
    const verified = authenticated && agents.some((item) => item.alias === "general-mahoraga" && item.published && item.active && item.provisioned);
    return Object.freeze({
      verified,
      summary: verified ? "Power Platform has an authenticated operating-system profile and the registered Mahoraga agent family is available." : "Power Platform authentication or registered Mahoraga agent readiness is unavailable.",
      providerHealth: Object.freeze({
        platformSupported: true,
        authenticated,
        authenticationClass: authenticated ? "operating-system-profile" : "unverified",
        publishedAgentCount,
        activeAgentCount,
        provisionedAgentCount,
        logicalAliases: Object.freeze(agents.map((item) => item.alias)),
        zeroCreditEligible: true,
        usageBillingClass: "deterministic-zero",
      }),
    });
  } catch {
    return unavailable(true);
  }
}

function descriptorForAgent({ alias, published, active, provisioned, metadata, observedAt }) {
  if (metadata !== null && !isRecord(metadata)) throw new TypeError("power-platform-harness-metadata-invalid");
  const safeMetadata = metadata ?? {
    harnessType: "unknown",
    capabilityClasses: [],
    instructionsSummary: "Authorized harness metadata unavailable.",
    knowledgeCategories: [],
    toolKinds: [],
    skillNames: [],
    connectedAgentAliases: [],
    modelClass: "unknown",
    modelStatus: "unknown",
    memoryEnabled: false,
    evaluation: { state: "unknown", score: 0, observedAt },
    monitoring: { successRate: 0, latencyMs: 0, observedAt },
    authorityScopes: [],
    dataClasses: [],
    observedAt,
  };
  return createCopilotHarnessDescriptor({
    alias,
    published,
    connectable: active && provisioned,
    ...safeMetadata,
  });
}

function unavailable(platformSupported) {
  return Object.freeze({
    verified: false,
    summary: "Power Platform provider discovery is unavailable.",
    providerHealth: Object.freeze({
      platformSupported,
      authenticated: false,
      authenticationClass: "unavailable",
      publishedAgentCount: 0,
      activeAgentCount: 0,
      provisionedAgentCount: 0,
      logicalAliases: Object.freeze([]),
      zeroCreditEligible: true,
      usageBillingClass: "deterministic-zero",
    }),
  });
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
