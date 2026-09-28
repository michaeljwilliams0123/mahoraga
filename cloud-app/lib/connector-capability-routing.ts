import { projectCapabilityFamilies, type CapabilityFamily } from "./capability-families";
import type { RuntimeCapability } from "./runtime-relay";

export type ConnectorBrokerEvidence = {
  bound: boolean;
  fresh: boolean;
  healthy: boolean;
  zeroCreditEligible: boolean;
  overPrivileged: boolean;
  paid: boolean;
  provider: string | null;
  capability: string | null;
  permissionClass: string | null;
};

export type ConnectorRoutingProjection = {
  value: string;
  detail: string;
  tone: "good" | "warn" | "neutral";
  failClosed: boolean;
  trafficAuthority: false;
  merge856IsTrafficAuthority: false;
  families: CapabilityFamily[];
  broker: ConnectorBrokerEvidence;
};

const PAID_COST = new Set(["licensed-cloud", "metered-cloud", "paid"]);
const OVER_PRIV = new Set(["admin", "owner", "wildcard", "universal"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function firstBoolean(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

export function readConnectorBrokerEvidence(health: unknown, capabilities: readonly RuntimeCapability[]): ConnectorBrokerEvidence {
  const root = asRecord(health);
  const nested = [
    root,
    asRecord(root?.connectorBroker),
    asRecord(root?.broker),
    asRecord(root?.runtime),
    asRecord(asRecord(root?.runtime)?.connectorBroker),
  ].filter((value): value is Record<string, unknown> => value !== null);

  const attested = capabilities.find((entry) =>
    entry.routable === true
    && entry.enabled !== false
    && entry.capability !== "codex.execute"
    && entry.capability !== "cognitive.cycle"
    && entry.capability !== "assistant.respond"
    && entry.capability !== "cognitive.predict",
  );

  const bound = firstBoolean(...nested.map((entry) => entry.bound), ...nested.map((entry) => entry.brokerBound)) === true
    || Boolean(attested);
  const fresh = firstBoolean(...nested.map((entry) => entry.fresh), ...nested.map((entry) => entry.attestedFresh)) !== false
    && bound;
  const healthy = firstBoolean(...nested.map((entry) => entry.healthy), ...nested.map((entry) => entry.healthOk)) !== false
    && bound;
  const cost = attested?.costClass ?? firstString(...nested.map((entry) => entry.costClass));
  const paid = PAID_COST.has(String(cost ?? ""));
  const permissionClass = firstString(
    (attested as { permissionClass?: string } | undefined)?.permissionClass,
    ...nested.map((entry) => entry.permissionClass),
  );
  const overPrivileged = OVER_PRIV.has(String(permissionClass ?? "").toLowerCase());
  const zeroCreditEligible = !paid && bound && (cost === "deterministic" || cost === "zero-credit" || cost == null);

  return {
    bound,
    fresh: Boolean(fresh),
    healthy: Boolean(healthy),
    zeroCreditEligible,
    overPrivileged,
    paid,
    provider: attested?.provider ?? firstString(...nested.map((entry) => entry.provider)),
    capability: attested?.capability ?? firstString(...nested.map((entry) => entry.capability)),
    permissionClass,
  };
}

export function projectConnectorCapabilityRouting(
  coreReady: boolean,
  capabilities: readonly RuntimeCapability[],
  health: unknown = null,
): ConnectorRoutingProjection {
  const families = projectCapabilityFamilies(coreReady, capabilities);
  const broker = readConnectorBrokerEvidence(health, coreReady ? capabilities : []);
  const failClosed = !coreReady
    || !broker.bound
    || !broker.fresh
    || !broker.healthy
    || broker.paid
    || broker.overPrivileged
    || !broker.zeroCreditEligible;

  const execution = families.find((family) => family.id === "execution");
  const agentic = families.find((family) => family.id === "agentic");

  if (failClosed) {
    return {
      value: "Fail closed",
      detail: `Broker evidence absent, stale, unhealthy, paid, or over-privileged · execution ${execution?.state ?? "unobserved"} · agentic ${agentic?.state ?? "unobserved"} · merge #856 is not live traffic authority`,
      tone: "warn",
      failClosed: true,
      trafficAuthority: false,
      merge856IsTrafficAuthority: false,
      families,
      broker,
    };
  }

  return {
    value: "Observed permissioned routes",
    detail: `Zero-credit ${broker.capability ?? "connector"} via ${broker.provider ?? "bound broker"} · permission ${broker.permissionClass ?? "attested"} · Cloudflare execution runtime · agentic ${agentic?.route ?? "cognitive.cycle"} stays separate · codex.execute is not the universal gate · no traffic authority`,
    tone: "good",
    failClosed: false,
    trafficAuthority: false,
    merge856IsTrafficAuthority: false,
    families,
    broker,
  };
}
