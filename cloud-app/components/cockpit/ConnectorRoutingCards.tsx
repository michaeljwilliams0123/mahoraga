"use client";

import { projectConnectorCapabilityRouting } from "@/lib/connector-capability-routing";
import type { RuntimeCapability } from "@/lib/runtime-relay";

type Props = {
  coreReady: boolean;
  runtimeCapabilities: readonly RuntimeCapability[];
  health: unknown;
};

function StatusCard({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: "good" | "warn" | "neutral" }) {
  return (
    <article className={`eclipse-status-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

export function ConnectorRoutingCards({ coreReady, runtimeCapabilities, health }: Props) {
  const connectorRouting = projectConnectorCapabilityRouting(coreReady, runtimeCapabilities, health);
  return (
    <>
      <StatusCard
        label="Permissioned connector routing"
        value={connectorRouting.value}
        detail={connectorRouting.detail}
        tone={connectorRouting.tone}
      />
      <StatusCard
        label="codex.execute lane"
        value="Separate coding lane"
        detail="codex.execute is not the universal external-action gate · permissioned zero-credit connector capabilities route into the Cloudflare execution runtime independently · merge #856 is not live traffic authority"
        tone="neutral"
      />
      <StatusCard
        label="Capability family projection"
        value="Agentic / Execution separated"
        detail="cognitive.cycle stays in the Agentic family · Execution routes project only from a bound connector broker with fresh attested grants (provider, capability, permission class, health, zero-credit eligibility) · fail closed when broker evidence is absent, stale, unhealthy, paid, or over-privileged"
        tone="neutral"
      />
    </>
  );
}

export const CONNECTOR_ROUTING_TELEMETRY = [
  "CONNECTOR_ROUTING_OBS",
  "CODEX_EXECUTE_SEPARATE",
  "FAMILY_SPLIT_AGENTIC_EXEC",
] as const;
