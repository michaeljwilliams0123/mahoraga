"use client";

import { Activity, GitBranch, Link2, ShieldCheck } from "lucide-react";
import type { CockpitViewProps } from "../workspace/workspace-types";

function shortSha(value: string | null | undefined) {
  return value ? value.slice(0, 12) : "unavailable";
}

export function CockpitView({
  coreReady,
  health,
  healthError,
  runtimeCapabilities,
  onRequestPairing,
  onOpenOperations,
  onOpenConnections,
}: CockpitViewProps) {
  const routable = runtimeCapabilities.filter((capability) => capability.routable);
  const workers = new Set(runtimeCapabilities.flatMap((capability) => capability.workerIds));
  const deploymentProvider = health?.deployment?.provider ?? "unknown";
  const deploymentCommit = health?.deployment?.commitSha;
  const deploymentEnvironment = health?.deployment?.environment ?? "unknown";
  const paidFallback = health?.routing?.automaticPaidFallback === true;

  return (
    <section className="connection-panel" aria-label="Control Center">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Single cloud surface</span>
          <h2>Control Center</h2>
        </div>
        <ShieldCheck size={20} />
      </div>

      <p>
        This is the canonical Mahoraga browser UI. It reports host-neutral cloud deployment identity and paired-core readiness without taking
        execution authority away from the Mahoraga core.
      </p>

      {healthError && (
        <div className="inline-alert" role="alert">
          Cloud health metadata could not be loaded. Core actions remain fail-closed.
        </div>
      )}

      <div className="capability-list" style={{ marginTop: 16 }}>
        <div>
          <strong>Deployment</strong>
          <span>
            {health?.product ?? "Mahoraga"} {health?.version ?? "unknown"} · {deploymentEnvironment}
          </span>
        </div>
        <div>
          <strong>Host provider</strong>
          <span>{deploymentProvider}</span>
        </div>
        <div>
          <strong>Git identity</strong>
          <span>
            <GitBranch size={14} /> {health?.deployment?.gitRef ?? "unknown-ref"} · {shortSha(deploymentCommit)}
          </span>
        </div>
        <div>
          <strong>Mahoraga core</strong>
          <span>{coreReady ? "paired · encrypted relay active" : "not paired · mutations unavailable"}</span>
        </div>
        <div>
          <strong>Routing authority</strong>
          <span>{health?.routing?.authority ?? "paired-mahoraga-core"}</span>
        </div>
        <div>
          <strong>Paid fallback</strong>
          <span>{paidFallback ? "enabled" : "disabled"}</span>
        </div>
        <div>
          <strong>Capabilities</strong>
          <span>
            {routable.length}/{runtimeCapabilities.length} routable · {workers.size} worker{workers.size === 1 ? "" : "s"}
          </span>
        </div>
        <div>
          <strong>Cloud boundary</strong>
          <span>{health?.boundaries?.executionPlane ?? "client-shell-with-owner-paired-core"}</span>
        </div>
        <div>
          <strong>Relay plaintext visibility</strong>
          <span>{health?.boundaries?.relaySeesPlaintext === true ? "unexpected" : "no"}</span>
        </div>
      </div>

      <div className="pairing-actions" style={{ marginTop: 16, flexWrap: "wrap" }}>
        {!coreReady && (
          <button type="button" onClick={onRequestPairing}>
            <Link2 size={16} /> Pair runtime
          </button>
        )}
        <button type="button" onClick={onOpenOperations}>
          <Activity size={16} /> Operations
        </button>
        <button type="button" onClick={onOpenConnections}>
          <Link2 size={16} /> Connections
        </button>
      </div>
    </section>
  );
}