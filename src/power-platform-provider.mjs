import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const LOGICAL_AGENTS = Object.freeze([
  Object.freeze({ displayName: "General Mahoraga", alias: "general-mahoraga" }),
  Object.freeze({ displayName: "Mahorago Enterprise Core", alias: "enterprise-core" }),
  Object.freeze({ displayName: "Mahorago Tenant Health Reader", alias: "tenant-health-reader" }),
]);
const PAC_OPTIONS = Object.freeze({ windowsHide: true, timeout: 20000, maxBuffer: 128 * 1024 });

export async function discoverPowerPlatformAgents({ runPac = execFileAsync } = {}) {
  const { stdout } = await runPac("pac.cmd", ["copilot", "list"], PAC_OPTIONS);
  const text = String(stdout ?? "");
  return Object.freeze(LOGICAL_AGENTS.flatMap(({ displayName, alias }) => {
    const line = text.split(/\r?\n/).find((item) => item.trimStart().startsWith(displayName));
    if (!line) return [];
    return [Object.freeze({
      alias,
      published: /\bPublished\b/i.test(line),
      active: /\bActive\b/i.test(line),
      provisioned: /\bProvisioned\b/i.test(line),
    })];
  }));
}

export async function probePowerPlatformProvider({ runPac = execFileAsync, platform = process.platform } = {}) {
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