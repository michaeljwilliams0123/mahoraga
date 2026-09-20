"use client";

import { useEffect, useState } from "react";
import { Activity, GitBranch, Link2, ShieldCheck } from "lucide-react";
import { projectInteractionReadiness, projectZeroCreditAdmission } from "@/lib/interaction-readiness";
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
  const expectedDeploymentCommit = health?.deployment?.expectedCommitSha;
  const deploymentConvergence = deploymentCommit && expectedDeploymentCommit
    ? deploymentCommit === expectedDeploymentCommit ? "Current" : "Drift"
    : "Unverified";
  const deploymentEnvironment = health?.deployment?.environment ?? "unknown";
  const promotionMode = health?.deployment?.promotion ?? "unverified";
  const deploymentUrl = health?.deployment?.url ?? "unavailable";
  const railwayExactSha = deploymentProvider === "railway" || promotionMode === "exact-sha-railway";
  const deploymentDetail = railwayExactSha
    ? `Railway is the server-capable runtime during migration · pin after merge · ${deploymentEnvironment}`
    : deploymentProvider === "vercel"
      ? `non-authoritative preview - historical only - not production · ${deploymentEnvironment}`
      : `${deploymentProvider} · ${deploymentEnvironment}`;
  const paidFallback = health?.routing?.automaticPaidFallback === true;
  const routeCoverage = runtimeCapabilities.length === 0 ? 0 : Math.round((routable.length / runtimeCapabilities.length) * 100);
  const runtimeDatabase = health?.runtime?.databaseTarget?.basename ?? "paired core required";
  const managementPlaneReady = health?.studio?.managementPlaneReady === true;
  const delegationRuntimeReady = health?.studio?.delegationRuntimeReady === true;
  const studioFullyReady = managementPlaneReady && delegationRuntimeReady;
  const productName = health?.product ?? "Mahoraga";
  const buildVersion = health?.build?.version ?? health?.version ?? "unavailable";
  const interaction = projectInteractionReadiness(runtimeCapabilities);
  const zeroCredit = projectZeroCreditAdmission(runtimeCapabilities);
  const liveOk = Boolean(health?.ok) && !healthError;
  const [readinessOk, setReadinessOk] = useState(false);

  useEffect(() => {
    let active = true;
    setReadinessOk(false);
    void fetch("/api/ready")
      .then((response) => { if (active) setReadinessOk(response.ok); })
      .catch(() => { if (active) setReadinessOk(false); });
    return () => { active = false; };
  }, [coreReady]);

  const readyOk = coreReady && readinessOk;

  return (
    <section className="connection-panel eclipse-console" aria-label="Control Center">
      <header className="eclipse-header">
        <div>
          <span className="eyebrow">Governed adaptive intelligence</span>
          <h2>Control Center</h2>
          <p>GitHub Pages publishes the static workspace. Execution stays on the encrypted relay to the Conversation Gateway / Railway runtime. 7.0.0-alpha.2 is build provenance only. Windows 3.6.0 stays untouched.</p>
        </div>
        <span className={coreReady ? "eclipse-live-state paired" : "eclipse-live-state"}>
          <span aria-hidden="true" />
          {readyOk ? "Ready · core paired" : coreReady ? "Paired · live pending" : "Workspace published · unpaired"}
        </span>
      </header>

      <p className="eclipse-readiness-note" role="status">
        Published static workspace: GitHub Pages (https://michaeljwilliams0123.github.io/mahoraga/). Execution path: existing encrypted relay. This origin does not make cross-origin authenticated API calls.
      </p>

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
            <p>GitHub Pages hosts the published static workspace; the encrypted relay remains the execution path. Execution begins only after an approved cloud or owner runtime supplies a verified session. Ready requires live health plus that pairing.</p>
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
          label="Ready / pairing"
          value={readyOk ? "Ready" : coreReady ? "Paired, live pending" : "Ready to pair"}
          detail={readyOk ? "Live health OK and core session paired" : "LIVE_OK alone is not Ready"}
          tone={readyOk ? "good" : "neutral"}
        />
        <StatusCard
          label="CI publish / steward"
          value="self-hosted Linux/X64"
          detail="Informational: publish and steward jobs use the self-hosted Linux/X64 lane"
          tone="neutral"
        />
        <StatusCard
          label="Deployment"
          value={railwayExactSha ? "Railway exact-SHA runtime" : health?.ok ? "Published" : "Awaiting health"}
          detail={deploymentDetail}
          tone={health?.ok && railwayExactSha ? "good" : health?.ok ? "neutral" : "warn"}
        />
        <StatusCard
          label="Source convergence"
          value={deploymentConvergence}
          detail={`actual ${shortSha(deploymentCommit)} · expected ${shortSha(expectedDeploymentCommit)}`}
          tone={deploymentConvergence === "Current" ? "good" : deploymentConvergence === "Drift" ? "warn" : "neutral"}
        />
        <StatusCard
          label="Expected SHA pin"
          value={expectedDeploymentCommit ? shortSha(expectedDeploymentCommit) : "Unset"}
          detail="Reconcile MAHORAGA_EXPECTED_GIT_SHA after each protected-main merge. Never derive the pin from the running SHA."
          tone={expectedDeploymentCommit ? (deploymentConvergence === "Current" ? "good" : "warn") : "warn"}
        />
        <StatusCard
          label="Owner login"
          value="AUTH_NO_STORE_#486"
          detail="Cache-Control: no-store · failure and success responses are not cached"
          tone="good"
        />
        <StatusCard
          label="Execution core"
          value={coreReady ? "Paired" : "Ready to pair"}
          detail={coreReady ? "Process health is not the answer lane" : "No execution authority claimed"}
          tone={coreReady ? "good" : "neutral"}
        />
        <StatusCard
          label="Answer lane"
          value={interaction.ready ? "Routable" : "Not routable"}
          detail={`${interaction.provider} · ${interaction.canary}${interaction.reason ? ` · ${interaction.reason}` : ""}`}
          tone={interaction.ready ? "good" : "warn"}
        />
        <StatusCard
          label="Zero-credit answers"
          value={zeroCredit.state === "allow" ? "Admitted" : zeroCredit.state === "deny" ? "Denied" : "On hold"}
          detail={`${zeroCredit.provider} · ${zeroCredit.costClass} · ${zeroCredit.reason}`}
          tone={zeroCredit.state === "allow" ? "good" : "warn"}
        />
        <StatusCard
          label="Model fabric"
          value={`${routable.length} verified route${routable.length === 1 ? "" : "s"}`}
          detail={`${routeCoverage}% routable · ${workers.size} worker lane${workers.size === 1 ? "" : "s"}`}
          tone={routable.length > 0 ? "good" : "neutral"}
        />
        <StatusCard
          label="Evolution lane"
          value="Verified convergence"
          detail="Stage → verify → canary → pin → converge"
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
            <div><dt>Browser presentation</dt><dd>GitHub Pages · https://michaeljwilliams0123.github.io/mahoraga/</dd></div>
            <div><dt>Host provider</dt><dd>{railwayExactSha ? "railway (server-capable runtime)" : deploymentProvider}</dd></div>
            <div><dt>Deployment URL</dt><dd>{deploymentUrl}</dd></div>
            <div><dt>Git identity</dt><dd><GitBranch size={14} /> {health?.deployment?.gitRef ?? "unknown-ref"} · {shortSha(deploymentCommit)}</dd></div>
            <div><dt>Expected SHA</dt><dd>{shortSha(expectedDeploymentCommit)}</dd></div>
            <div><dt>Promotion mode</dt><dd>{promotionMode}</dd></div>
            <div><dt>Source convergence</dt><dd>{deploymentConvergence}</dd></div>
            <div><dt>Pin policy</dt><dd>independent Railway pin after each protected-main merge</dd></div>
            <div><dt>CI publish/steward</dt><dd>self-hosted Linux/X64 lane (informational)</dd></div>
            <div><dt>Routing authority</dt><dd>{health?.routing?.authority ?? "paired-mahoraga-core"}</dd></div>
            <div><dt>Paid fallback</dt><dd>{paidFallback ? "enabled" : "disabled"}</dd></div>
            <div><dt>Cloud boundary</dt><dd>{health?.boundaries?.executionPlane ?? "client-shell-with-owner-paired-core"}</dd></div>
            <div><dt>Relay plaintext</dt><dd>{health?.boundaries?.relaySeesPlaintext === true ? "unexpected" : "not visible"}</dd></div>
            <div><dt>Runtime DB target</dt><dd>{runtimeDatabase}</dd></div>
            <div><dt>Interaction readiness</dt><dd>{interaction.ready ? "ready" : "blocked"} · {interaction.provider} · {interaction.canary}</dd></div>
            <div><dt>Zero-credit admission</dt><dd>{zeroCredit.state} · {zeroCredit.costClass} · no paid fallback</dd></div>
            <div><dt>Billing evidence</dt><dd>{zeroCredit.billingClass} · {zeroCredit.lastVerifiedAt ?? "verification unavailable"}</dd></div>
          </dl>
        </section>

        <section className="eclipse-panel" aria-labelledby="evolution-heading">
          <div className="eclipse-panel-heading">
            <div>
              <span>Adaptive evolution</span>
              <h3 id="evolution-heading">Verified convergence path</h3>
            </div>
            <ShieldCheck size={18} />
          </div>
          <ol className="eclipse-flow">
            <li><span>1</span><div><strong>Stage</strong><small>Isolated candidate or feature branch</small></div></li>
            <li><span>2</span><div><strong>Verify</strong><small>Exact-head CI plus rollback checkpoint</small></div></li>
            <li><span>3</span><div><strong>Canary</strong><small>Prove candidate and runtime readiness</small></div></li>
            <li><span>4</span><div><strong>Pin</strong><small>Reconcile Railway expected SHA independently of the running process</small></div></li>
            <li><span>5</span><div><strong>Converge</strong><small>Activate through the verified boundary and retain rollback</small></div></li>
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
          <p>Direction → Compile → Delta → Verify → Learn - selective institutional memory</p>
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
