import { createHash } from "node:crypto";

const CONNECTORS = Object.freeze(["github", "m365", "mcp", "local-toolbox"]);

export function simulateConnectorCoordination({ repositoryVisibility = "private", authenticated = true, ownerBound = true, transport = "owner-authenticated-relay", requestedConnector = "github", providerCalls = 0 } = {}) {
  const connectorKnown = CONNECTORS.includes(requestedConnector);
  const privateRepoProtected = repositoryVisibility !== "private" || authenticated;
  const transportApproved = transport === "owner-authenticated-relay";
  const zeroCredit = providerCalls === 0;
  const admitted = connectorKnown && privateRepoProtected && ownerBound && transportApproved && zeroCredit;
  const correlationId = `connector-sim-${createHash("sha256").update(JSON.stringify({ requestedConnector, repositoryVisibility, authenticated, ownerBound, transport })).digest("hex").slice(0, 16)}`;
  return Object.freeze({ ok: admitted, admitted, correlationId, requestedConnector, repositoryVisibility, transport, providerCalls, assertions: Object.freeze({ connectorKnown, privateRepoProtected, ownerBound: Boolean(ownerBound), transportApproved, zeroCredit }), observation: admitted ? "simulated connector handoff admitted" : "simulated connector handoff denied fail-closed" });
}

export function runConnectorSimulationMatrix() {
  const scenarios = [
    { name: "private-github", requestedConnector: "github" },
    { name: "private-m365", requestedConnector: "m365" },
    { name: "private-mcp", requestedConnector: "mcp" },
    { name: "local-toolbox", requestedConnector: "local-toolbox" },
    { name: "deny-unauthenticated-private", requestedConnector: "github", authenticated: false },
    { name: "deny-unapproved-transport", requestedConnector: "mcp", transport: "unapproved" },
    { name: "deny-provider-fallback", requestedConnector: "m365", providerCalls: 1 },
  ];
  const results = scenarios.map(({ name, ...input }) => ({ name, ...simulateConnectorCoordination(input) }));
  const expected = results.every((result) => result.name.startsWith("deny-") ? !result.ok : result.ok);
  return Object.freeze({ ok: expected, externalProviderCalls: 0, results });
}
