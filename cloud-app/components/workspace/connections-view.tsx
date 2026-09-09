"use client";

import { Link2, ShieldCheck, Unplug } from "lucide-react";
import type { RuntimeCapability } from "@/lib/runtime-relay";
import type { ConnectionsViewProps } from "./workspace-types";

function capabilitySummary(capability: RuntimeCapability) {
  const workers = capability.workerIds.length > 0 ? capability.workerIds.join(", ") : "no workers reported";
  return `${capability.routable ? "routable" : "not routable"} · ${workers}`;
}

export function ConnectionsView({
  coreReady,
  health,
  runtimeCapabilities,
  onRequestPairing,
  onDisconnect,
}: ConnectionsViewProps) {
  const routableCount = runtimeCapabilities.filter((capability) => capability.routable).length;

  return (
    <section className="connection-panel" aria-label="Connections">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Core-mediated</span>
          <h2>Connections</h2>
        </div>
        <ShieldCheck size={20} />
      </div>

      <p>
        Provider and worker readiness comes only from the paired Mahoraga core. This browser does not select providers, hold GitHub authority,
        or create an alternate execution path.
      </p>

      <div className="capability-list" style={{ marginTop: 16 }}>
        <div>
          <strong>Encrypted relay</strong>
          <span>{coreReady ? "connected · wss relay · encrypted frames" : "not paired"}</span>
        </div>
        <div>
          <strong>Execution authority</strong>
          <span>{health?.routing?.authority ?? "paired-mahoraga-core"}</span>
        </div>
        <div>
          <strong>Direct provider selection</strong>
          <span>{health?.capabilities?.directProviderSelection === true ? "enabled" : "disabled"}</span>
        </div>
        <div>
          <strong>Credit-free autonomy</strong>
          <span>{health?.routing?.automaticPaidFallback === true ? "paid fallback (denied policy)" : "zero-credit · no paid fallback"}</span>
        </div>
        <div>
          <strong>Capability readiness</strong>
          <span>
            {routableCount}/{runtimeCapabilities.length} routable
          </span>
        </div>
      </div>

      {coreReady && runtimeCapabilities.length === 0 && <p className="muted">The paired core reported no capability records.</p>}

      {runtimeCapabilities.length > 0 && (
        <div className="capability-list" style={{ marginTop: 16 }}>
          {runtimeCapabilities.map((capability) => (
            <div key={capability.capability}>
              <strong>{capability.capability}</strong>
              <span>{capabilitySummary(capability)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="pairing-actions" style={{ marginTop: 16 }}>
        {!coreReady ? (
          <button type="button" onClick={onRequestPairing}>
            <Link2 size={16} /> Pair runtime
          </button>
        ) : (
          <button type="button" onClick={() => void onDisconnect()}>
            <Unplug size={16} /> Disconnect
          </button>
        )}
      </div>
    </section>
  );
}
