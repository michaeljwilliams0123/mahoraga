import type { RuntimeCapability } from "./runtime-relay";

const TOOL_CAPABILITY = /^(?:repository|cloud|browser|desktop|integration|artifact)\./;

/** Only projects supplied capability observations. Not a broker-binding or execution receipt. */
export function projectExecutionBrokerObservation(capabilities: readonly RuntimeCapability[]) {
  const observed = capabilities.filter(capability =>
    TOOL_CAPABILITY.test(capability.capability));
  const unique = new Map<string, RuntimeCapability[]>();
  for (const capability of observed) {
    const rows = unique.get(capability.capability) ?? [];
    rows.push(capability);
    unique.set(capability.capability, rows);
  }
  const routable = [...unique.values()].filter(rows => rows.some(row => row.enabled !== false && row.routable === true)).length;
  const held = unique.size - routable;
  const status = unique.size === 0 ? "unobserved" : held === 0 ? "observed-routable" : "partially-held";
  const reasons = [...new Set([...unique.values()].flatMap(rows =>
    rows.some(row => row.enabled !== false && row.routable === true) ? [] : rows.map(row => row.enabled === false ? "capability-disabled" : (row.routingReason ?? row.providerReasonCode ?? "unverified-route"))
  ))].slice(0, 3);
  return Object.freeze({ status, observed: unique.size, routable, held, reasons: Object.freeze(reasons) });
}
