"use client";

import { Activity, GitBranch, Link2, ShieldCheck } from "lucide-react";
import type { CockpitViewProps } from "../workspace/workspace-types";

function shortSha(value: string | null | undefined) {
  return value ? value.slice(0, 12) : "unavailable";
}

function StatusCard({ label, value, detail, tone = "neutral" }: { label: string; value: string; detail: string; tone?: "good" | "warn" | "neutral" }) {
  return (
    <article className={`eclipse-status-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
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
  const routeCoverage = runtimeCapabilities.length === 0 ? 0 : Math.round((routable.length / runtimeCapabilities.length) * 100);
  const runtimeDatabase = health?.runtime?.databaseTarget?.basename ?? "paired core required";
  const managementPlaneReady = health?.studio?.managementPlaneReady === true;
  const delegationRuntimeReady = health?.studio?.delegationRuntimeReady === true;
  const studioFullyReady = managementPlaneReady && delegationRuntimeReady;
  const productName = health?.product ?? "Mahoraga";
  const buildVersion = health?.build?.version ?? health?.version ?? "7.0.0-alpha.2";

  return (
    <section className="connection-panel eclipse-console" aria-label="Control Center">
      <header className="eclipse-header">
        <div>
          <span className="eyebrow">Governed adaptive intelligence</span>
          <h2>Control Center</h2>
          <p>One cockpit for deployment identity, verified model routes, connector readiness, and policy-gated evolution.</p>
        </div>
        <span className={coreReady ? "eclipse-live-state paired" : "eclipse-live-state"}>
          <span aria-hidden="true" />
          {coreReady ? "Core paired" : "Workspace published"}
        </span>
      </header>

      {healthError && (
        <div className="inline-alert" role="alert">
          Cloud health metadata could not be loaded. Core actions remain fail-closed.
        </div>
      )}

      {!coreReady && !healthError && (
        <div className="eclipse-readiness-note" role="status">
          <ShieldCheck size={18} />
          <div>
            <strong>The interface is online and ready to pair.</strong>
            <p>GitHub Pages serves the static workspace; execution begins only after an approved cloud or owner runtime supplies a verified session.</p>
          </div>
        </div>
      )}

      <div className="eclipse-status-grid">
        <StatusCard
          label="Product"
          value={productName}
          detail={`Build provenance ${buildVersion}`}
          tone="good"
        />
        <StatusCard
          label="Deployment"
          value={health?.ok ? "Published" : "Awaiting health"}
          detail={`${deploymentProvider} · ${deploymentEnvironment}`}
          tone={health?.ok ? "good" : "warn"}
        />
        <StatusCard
          label="Execution core"
          value={coreReady ? "Paired" : "Ready to pair"}
          detail={coreReady ? "Encrypted relay session active" : "No execution authority claimed"}
          tone={coreReady ? "good" : "neutral"}
        />
        <StatusCard
          label="Model fabric"
          value={`${routable.length} verified route${routable.length === 1 ? "" : "s"}`}
          detail={`${routeCoverage}% routable · ${workers.size} worker lane${workers.size === 1 ? "" : "s"}`}
          tone={routable.length > 0 ? "good" : "neutral"}
        />
        <StatusCard
          label="Evolution lane"
          value="Policy gated"
          detail="Stage → verify → review → promote"
          tone="good"
        />
      </div>

      <div className="eclipse-detail-grid">
        <section className="eclipse-panel" aria-labelledby="telemetry-heading">
          <div className="eclipse-panel-heading">
            <div>
              <span>Measured telemetry</span>
              <h3 id="telemetry-heading">Deployment snapshot</h3>
            </div>
            <Activity size={18} />
          </div>
          <dl className="eclipse-metrics">
            <div><dt>Product identity</dt><dd>{productName}</dd></div>
            <div><dt>Build provenance</dt><dd>{buildVersion}</dd></div>
            <div><dt>Host provider</dt><dd>{deploymentProvider}</dd></div>
            <div><dt>Git identity</dt><dd><GitBranch size={14} /> {health?.deployment?.gitRef ?? "unknown-ref"} · {shortSha(deploymentCommit)}</dd></div>
            <div><dt>Routing authority</dt><dd>{health?.routing?.authority ?? "paired-mahoraga-core"}</dd></div>
            <div><dt>Paid fallback</dt><dd>{paidFallback ? "enabled" : "disabled"}</dd></div>
            <div><dt>Cloud boundary</dt><dd>{health?.boundaries?.executionPlane ?? "client-shell-with-owner-paired-core"}</dd></div>
            <div><dt>Relay plaintext</dt><dd>{health?.boundaries?.relaySeesPlaintext === true ? "unexpected" : "not visible"}</dd></div>
            <div><dt>Runtime DB target</dt><dd>{runtimeDatabase}</dd></div>
          </dl>
        </section>

        <section className="eclipse-panel" aria-labelledby="evolution-heading">
          <div className="eclipse-panel-heading">
            <div>
              <span>Adaptive evolution</span>
              <h3 id="evolution-heading">Verified promotion path</h3>
            </div>
            <ShieldCheck size={18} />
          </div>
          <ol className="eclipse-flow">
            <li><span>1</span><div><strong>Stage</strong><small>Isolated candidate or feature branch</small></div></li>
            <li><span>2</span><div><strong>Verify</strong><small>Focused tests plus required CI</small></div></li>
            <li><span>3</span><div><strong>Review</strong><small>Exact-head evidence and policy checks</small></div></li>
            <li><span>4</span><div><strong>Promote</strong><small>Owner-authorized merge and deployment</small></div></li>
          </ol>
        </section>
      </div>

      <section className="eclipse-panel eclipse-admission" aria-label="Learning and admission policy">
        <div>
          <span className="eyebrow">Evidence plane</span>
          <strong>Copilot Studio learning</strong>
          <p>ingestion bridge available - paired-core readiness determines live ingestion</p>
        </div>
        <div>
          <strong>managementPlaneReady</strong>
          <p>{managementPlaneReady ? "management plane ready - Studio control surface reachable" : "management plane unavailable - Studio control surface not verified"}</p>
        </div>
        <div>
          <strong>delegationRuntimeReady</strong>
          <p>{delegationRuntimeReady ? "delegation runtime ready - runtime binding present" : "delegation unavailable - scopes stay empty without runtime binding"}</p>
        </div>
        <div>
          <strong>Studio admission</strong>
          <p>{studioFullyReady ? "verified + approved metadata only - source copilot-studio-mahoraga" : "management-ready / delegation-unavailable - not fully available; no widened studio.delegate authority"}</p>
        </div>
        <div>
          <strong>Studio authority</strong>
          <p>non-authoritative evidence plane - Mahoraga remains canonical</p>
        </div>
        <div>
          <strong>Adaptive review</strong>
          <p>Direction -&gt; Compile -&gt; Delta -&gt; Verify -&gt; Learn - selective institutional memory</p>
        </div>
      </section>

      <div className="pairing-actions eclipse-actions">
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
