"use client";

import type { RuntimeCapability } from "@/lib/runtime-relay";
import { projectConnectorCapabilityRouting } from "@/lib/connector-capability-routing";
import { ProviderAdmissionRenewalCard } from "./ProviderAdmissionRenewalCard";
import type { Health } from "../workspace/workspace-types";

function StatusCard({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: "good" | "warn" | "neutral" }) {
  return (
    <article className={`eclipse-status-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

export function ConnectorRoutingCards({
  coreReady,
  runtimeCapabilities,
  health,
}: {
  coreReady: boolean;
  runtimeCapabilities: readonly RuntimeCapability[];
  health: unknown;
}) {
  const routing = projectConnectorCapabilityRouting(coreReady, runtimeCapabilities, health);
  const agentic = routing.families.find((family) => family.id === "agentic");
  const execution = routing.families.find((family) => family.id === "execution");

  return (
    <>
      <ProviderAdmissionRenewalCard health={(health as Health | null) ?? null} />
      <StatusCard
        label="Permissioned connector routing"
        value={routing.value}
        detail={`${routing.detail} · fail closed when broker evidence is absent, stale, unhealthy, paid, or over-privileged · Merge #856 is not live traffic authority`}
        tone={routing.tone}
      />
      <StatusCard
        label="codex.execute lane"
        value="Separate coding lane"
        detail="codex.execute is not the universal external-action gate · CONNECTOR_ROUTING_OBS · CODEX_EXECUTE_SEPARATE"
        tone="neutral"
      />
      <StatusCard
        label="Capability family projection"
        value={`agentic ${agentic?.state ?? "unobserved"} · execution ${execution?.state ?? "unobserved"}`}
        detail={`cognitive.cycle stays off Execution routes · FAMILY_SPLIT_AGENTIC_EXEC · Merge #856 is not live traffic authority`}
        tone="neutral"
      />
    </>
  );
}
