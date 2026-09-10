import { discoverPowerPlatformAgents, probePowerPlatformProvider } from "./power-platform-provider.mjs";

export async function executePowerPlatformCapability(capability, _task = {}, _worker = {}, dependencies = {}) {
  const probe = dependencies.probePowerPlatformProvider ?? probePowerPlatformProvider;
  const discover = dependencies.discoverPowerPlatformAgents ?? discoverPowerPlatformAgents;
  if (capability === "powerplatform.health") return probe(dependencies.providerDependencies ?? {});
  if (capability === "powerplatform.discover") {
    const agents = await discover(dependencies.providerDependencies ?? {});
    return Object.freeze({
      verified: true,
      summary: `Power Platform discovered ${agents.length} registered Mahoraga agent role(s).`,
      providerHealth: Object.freeze({
        logicalAliases: Object.freeze(agents.map((item) => item.alias)),
        publishedAgentCount: agents.filter((item) => item.published).length,
        activeAgentCount: agents.filter((item) => item.active).length,
        provisionedAgentCount: agents.filter((item) => item.provisioned).length,
        zeroCreditEligible: true,
        usageBillingClass: "deterministic-zero",
      }),
    });
  }
  throw Object.assign(new Error("unsupported-capability"), { code: "unsupported-capability" });
}