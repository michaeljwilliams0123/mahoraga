"use client";

import { Link2, ShieldCheck, Unplug } from "lucide-react";
import { useState } from "react";
import type { RuntimeCapability, RuntimeComposioRepositoryProbe } from "@/lib/runtime-relay";
import type { ConnectionsViewProps } from "./workspace-types";

type DisplayCapability = RuntimeCapability & { providerReasonCode?: string | null };

function capabilitySummary(capability: RuntimeCapability) {
  const workers = capability.workerIds.length > 0 ? capability.workerIds.join(", ") : "no workers reported";
  return `${capability.routable ? "routable" : "not routable"} · ${workers}`;
}

export function ConnectionsView({
  coreReady,
  health,
  runtimeCapabilities,
  relay,
  onRequestPairing,
  onDisconnect,
}: ConnectionsViewProps) {
  const displayCapabilities = runtimeCapabilities as DisplayCapability[];
  const routableCount = displayCapabilities.filter((capability) => capability.routable).length;
  const [composioProbe, setComposioProbe] = useState<RuntimeComposioRepositoryProbe | null>(null);
  const [composioBusy, setComposioBusy] = useState(false);
  const [composioError, setComposioError] = useState<string | null>(null);

  async function probeComposio() {
    if (!relay || composioBusy) return;
    setComposioBusy(true);
    setComposioError(null);
    try {
      setComposioProbe(await relay.composioGithubRepository("michaeljwilliams0123", "mahoraga"));
    } catch (error) {
      setComposioProbe(null);
      setComposioError(error instanceof Error ? error.message : "composio-probe-failed");
    } finally {
      setComposioBusy(false);
    }
  }

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
            {routableCount}/{displayCapabilities.length} routable
          </span>
        </div>
      </div>

      {coreReady && displayCapabilities.length === 0 && <p className="muted">The paired core reported no capability records.</p>}

      {displayCapabilities.length > 0 && (
        <div className="capability-list" style={{ marginTop: 16 }}>
          {displayCapabilities.map((capability) => (
            <div key={capability.capability}>
              <strong>{capability.capability}</strong>
              <span>{capabilitySummary(capability)}</span>
              {!capability.routable && (capability.providerReasonCode ?? capability.routingReason) && (
                <span>Readiness reason · {capability.providerReasonCode ?? capability.routingReason}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {coreReady && (
        <div className="capability-list" style={{ marginTop: 16 }}>
          <div>
            <strong>Composio → GitHub</strong>
            <span>
              {composioProbe?.repository.fullName
                ? `verified · ${composioProbe.repository.fullName} · ${composioProbe.repository.defaultBranch ?? "unknown branch"}`
                : composioError
                  ? `not ready · ${composioError}`
                  : "bounded read probe available"}
            </span>
          </div>
          {composioProbe && (
            <div>
              <strong>Composio authority</strong>
              <span>{composioProbe.repository.permissions.push ? "GitHub write authority observed; probe remains read-only" : "GitHub read authority observed"}</span>
            </div>
          )}
        </div>
      )}

      <div className="pairing-actions" style={{ marginTop: 16 }}>
        {coreReady && (
          <button type="button" disabled={composioBusy || !relay} onClick={() => void probeComposio()}>
            <Link2 size={16} /> {composioBusy ? "Probing Composio…" : "Probe Composio GitHub"}
          </button>
        )}
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
