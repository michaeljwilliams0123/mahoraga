import { collectConnectorCapabilityRoutes, type ConnectorBrokerBinding, type ConnectorCapabilityRoute } from "./connector-capability-router";

export type UniversalBrokerBinding = { fetch(request: Request): Promise<Response> };

export type UniversalCapabilityRoute = {
  capability: string;
  routable: true;
  enabled: true;
  provider: string;
  workerId?: string;
  workerIds: string[];
  costClass?: string;
  permissionClass?: string;
  routingReason: null;
  providerReasonCode: null;
  evidenceLevel: "runtime-execution";
  lastObservedAt?: string;
  expiresAt?: string;
};

function validRoute(value: unknown, now: number): value is UniversalCapabilityRoute {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const route = value as Record<string, unknown>;
  if (typeof route.capability !== "string" || !route.capability || route.routable !== true || route.enabled !== true) return false;
  if (typeof route.provider !== "string" || !route.provider || !Array.isArray(route.workerIds) || !route.workerIds.every((id) => typeof id === "string" && id.length > 0)) return false;
  if (route.evidenceLevel !== "runtime-execution" || route.routingReason !== null || route.providerReasonCode !== null) return false;
  const observedAt = Date.parse(String(route.lastObservedAt ?? ""));
  const expiresAt = Date.parse(String(route.expiresAt ?? ""));
  return Number.isFinite(observedAt) && Number.isFinite(expiresAt) && observedAt <= now + 5_000 && expiresAt > now && expiresAt - observedAt <= 5 * 60_000;
}

export async function collectUniversalCapabilityRoutes(
  broker: UniversalBrokerBinding | undefined,
  legacyBroker: ConnectorBrokerBinding | undefined,
  now = Date.now(),
): Promise<Array<UniversalCapabilityRoute | ConnectorCapabilityRoute>> {
  if (!broker) return collectConnectorCapabilityRoutes(legacyBroker, now);
  try {
    const response = await broker.fetch(new Request("https://mahoraga-execution-broker/api/capabilities", {
      method: "GET",
      headers: { accept: "application/json" },
    }));
    if (!response.ok) return [];
    const value = await response.json() as { routes?: unknown };
    if (!Array.isArray(value.routes)) return [];
    const seen = new Set<string>();
    const routes: UniversalCapabilityRoute[] = [];
    for (const route of value.routes) {
      if (!validRoute(route, now)) continue;
      const key = `${route.capability}/${route.provider}/${route.workerId ?? route.workerIds.join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      routes.push(route);
    }
    return routes;
  } catch {
    return [];
  }
}
