"use client";

import { useEffect, useState } from "react";
import { Activity, GitBranch, Link2, ShieldCheck } from "lucide-react";
import { projectInteractionReadiness, projectZeroCreditAdmission } from "@/lib/interaction-readiness";
import { projectCognitiveLearningSurface } from "@/lib/cognitive-learning-surface";
import type { CollectiveDissentReceipt } from "@/lib/dissent-receipt";
import type { CockpitViewProps, Health, SanitizedAcceptanceReceipt } from "../workspace/workspace-types";
import { DissentReceiptPanel } from "./DissentReceiptPanel";

const CLOUDFLARE_WORKSPACE_CANDIDATE = "https://mahoraga-workspace-candidate.mahoraga-mjw0123.workers.dev";
const EXPECTED_PROVIDER_ID = "cloudflare-workers-ai";
const EXPECTED_MODEL_ID = "@cf/zai-org/glm-4.7-flash";
type ReadinessObservation = { status: string; sha: string | null; durableState: string | null };

function parseReadinessObservation(value: unknown): ReadinessObservation | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.status !== "string") return null;
  return {
    status: candidate.status,
    sha: typeof candidate.sha === "string" ? candidate.sha : null,
    durableState: typeof candidate.durableState === "string" ? candidate.durableState : null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstBoolean(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function parseSanitizedAcceptance(health: Health | null): SanitizedAcceptanceReceipt & { bypassApplied: boolean } {
  const root = asRecord(health);
  const nested = [
    root,
    asRecord(root?.acceptance),
    asRecord(root?.productionAcceptance),
    asRecord(root?.cloudflareAcceptance),
    asRecord(root?.receipt),
    asRecord(root?.runtime),
    asRecord(asRecord(root?.runtime)?.acceptance),
  ].filter((value): value is Record<string, unknown> => value !== null);

  const providerCognitionVerified = firstBoolean(...nested.map((entry) => entry.providerCognitionVerified)) === true;
  const noRailwayFallbackVerified = firstBoolean(...nested.map((entry) => entry.noRailwayFallbackVerified)) === true;
  const trafficAuthorityVerified = firstBoolean(...nested.map((entry) => entry.trafficAuthorityVerified)) === true;
  const bypassApplied = firstBoolean(...nested.map((entry) => entry["x-bypass-applied"])) === true;
  const providerId = firstString(...nested.map((entry) => entry.providerId));
  const modelId = firstString(...nested.map((entry) => entry.modelId));

  return {
    providerCognitionVerified: providerCognitionVerified && !bypassApplied,
    noRailwayFallbackVerified: noRailwayFallbackVerified && !bypassApplied,
    trafficAuthorityVerified,
    providerId,
    modelId,
    "x-bypass-applied": bypassApplied,
    bypassApplied,
  };
}

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
    ? `Promote after Verify Mahoraga on main · verified run SHA (#656) · Wait for CI disabled · ${deploymentEnvironment}`
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
  const learning = projectCognitiveLearningSurface(health?.cognitiveLearning);
  const liveOk = Boolean(health?.ok) && !healthError;
  const acceptance = parseSanitizedAcceptance(health);
  const cognitionObserved = acceptance.providerCognitionVerified === true;
  const noRailwayVerified = acceptance.noRailwayFallbackVerified === true;
  const cognitionDetail = cognitionObserved
    ? `${acceptance.providerId ?? EXPECTED_PROVIDER_ID} · ${acceptance.modelId ?? EXPECTED_MODEL_ID} · receipt-gated`
    : "Unverified until providerCognitionVerified is true on sanitized health/runtime metadata; never inferred from /api/ready";
  const noRailwayDetail = noRailwayVerified
    ? "Verified no Railway fallback on sanitized receipt; Railway remains rollback/evidence anchor"
    : "Unproven; Railway remains the rollback/evidence anchor until noRailwayFallbackVerified is true";
  const [readiness, setReadiness] = useState<ReadinessObservation | null>(null);
  const dissentReceipt = (health as { collectiveDissent?: CollectiveDissentReceipt } | null)?.collectiveDissent ?? null;

  useEffect(() => {
    let active = true;
    setReadiness(null);
    void fetch("/api/ready")
      .then(async (response) => response.ok ? parseReadinessObservation(await response.json()) : null)
      .then((observation) => { if (active) setReadiness(observation); })
      .catch(() => { if (active) setReadiness(null); });
    return () => { active = false; };
  }, [coreReady]);

  const readinessOk = readiness?.status === "ready";
  const readyOk = coreReady && readinessOk;

  return (
    <section className="connection-panel eclipse-console" aria-label="Control Center">
      <header className="eclipse-header">
        <div>
          <span className="eyebrow">Governed adaptive intelligence</span>
          <h2>Control Center</h2>
          <p>Cloudflare root-path candidate is the migration browser surface; GitHub Pages remains a presentation/export fallback. Execution readiness, cognition readiness, and traffic authority remain separate. 7.0.0-alpha.2 is build provenance only. Windows 3.6.0 stays untouched.</p>
        </div>
        <span className={coreReady ? "eclipse-live-state paired" : "eclipse-live-state"}>
          <span aria-hidden="true" />
          {readyOk ? "Ready · core paired" : coreReady ? "Paired · live pending" : "Workspace published · unpaired"}
        </span>
      </header>

      <p className="eclipse-readiness-note" role="status">
        Cloudflare candidate browser: {CLOUDFLARE_WORKSPACE_CANDIDATE} · promotion unverified-cloudflare-static. GitHub Pages remains a presentation/export fallback. /api/ready is observational execution/durable-state evidence only and never grants traffic/domain authority.
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
            <p>The Cloudflare candidate and GitHub Pages export are presentation surfaces only. Execution begins only after an approved owner-authenticated runtime supplies a verified session. Ready requires observed execution readiness plus pairing; traffic authority remains independently gated.</p>
          </div>
        </div>
      )}

      <div className="eclipse-status-grid">
        <StatusCard label="Product" value={productName} detail={`Build provenance ${buildVersion}`} tone="good" />
        <StatusCard label="Source Truth" value="Protected GitHub main" detail="Source authority only · exact-head Verify (ubuntu-latest + windows-latest) · edge-convergence foundation #665" tone="good" />
        <StatusCard label="Deployment Truth" value={railwayExactSha ? "Railway exact-SHA" : deploymentProvider} detail={`${deploymentConvergence} · actual ${shortSha(deploymentCommit)} · expected ${shortSha(expectedDeploymentCommit)}`} tone={deploymentConvergence === "Current" ? "good" : deploymentConvergence === "Drift" ? "warn" : "neutral"} />
        <StatusCard label="Live-Runtime Truth" value={liveOk ? "Observed live" : healthError ? "Unavailable" : "Pending"} detail="/api/live observation only · does not prove source or deployment convergence" tone={liveOk ? "good" : healthError ? "warn" : "neutral"} />
        <StatusCard label="Ready / pairing" value={readyOk ? "Ready" : coreReady ? "Paired, execution pending" : "Ready to pair"} detail={readyOk ? `Execution ready at ${shortSha(readiness?.sha)} with paired core` : "LIVE_OK alone is not Ready"} tone={readyOk ? "good" : "neutral"} />
        <StatusCard label="Execution readiness" value={readinessOk ? "Observed ready" : "Not proven"} detail={`SHA ${shortSha(readiness?.sha)} · durable ${readiness?.durableState ?? "unavailable"} · cloudflare-execution-runtime is hop identity only`} tone={readinessOk ? "good" : "neutral"} />
        <StatusCard label="Cloudflare cognition" value={cognitionObserved ? "Observed" : "Unverified"} detail={cognitionDetail} tone={cognitionObserved ? "good" : "neutral"} />
        <StatusCard label="No Railway fallback" value={noRailwayVerified ? "Verified" : "Unproven"} detail={noRailwayDetail} tone={noRailwayVerified ? "good" : "neutral"} />
        <StatusCard label="Traffic authority" value="Separate / unverified" detail="Never inferred from /api/ready; trafficAuthorityVerified stays unpromoted even if acceptance or ready is true" tone="neutral" />
        <StatusCard label="Billing Read token" value="Optional · fail-closed" detail="CLOUDFLARE_BILLING_READ_TOKEN is subscriptions read on cutover + hourly renewal only. cloudflare-subscriptions-billing-read-required-403 fails closed. Operator: same-account token with Account → Billing → Read. No secret values stored. Not traffic authority." tone="neutral" />
        <StatusCard label="CI publish / steward" value="self-hosted Linux/X64" detail="Informational: publish and steward jobs use the self-hosted Linux/X64 lane" tone="neutral" />
        <StatusCard label="Deployment" value={railwayExactSha ? "Railway exact-SHA runtime" : health?.ok ? "Published" : "Awaiting health"} detail={deploymentDetail} tone={health?.ok && railwayExactSha ? "good" : health?.ok ? "neutral" : "warn"} />
        <StatusCard label="Deployment convergence" value={deploymentConvergence} detail={`actual ${shortSha(deploymentCommit)} · expected ${shortSha(expectedDeploymentCommit)}`} tone={deploymentConvergence === "Current" ? "good" : deploymentConvergence === "Drift" ? "warn" : "neutral"} />
        <StatusCard label="Expected SHA pin" value={expectedDeploymentCommit ? shortSha(expectedDeploymentCommit) : "Unset"} detail="MAHORAGA_EXPECTED_GIT_SHA · promote after Verify Mahoraga on main using the verified run SHA, not Railway GitHub status. Wait for CI disabled." tone={expectedDeploymentCommit ? (deploymentConvergence === "Current" ? "good" : "warn") : "warn"} />
        <StatusCard label="Owner login" value="AUTH_NO_STORE_#486" detail="Cache-Control: no-store · failure and success responses are not cached" tone="good" />
        <StatusCard label="Execution core" value={coreReady ? "Paired" : "Ready to pair"} detail={coreReady ? "Process health is not the answer lane" : "No execution authority claimed"} tone={coreReady ? "good" : "neutral"} />
        <StatusCard label="Answer lane" value={interaction.ready ? "Routable" : "Not routable"} detail={`${interaction.provider} · ${interaction.canary}${interaction.reason ? ` · ${interaction.reason}` : ""}`} tone={interaction.ready ? "good" : "warn"} />
        <StatusCard label="Zero-credit answers" value={zeroCredit.state === "allow" ? "Admitted" : zeroCredit.state === "deny" ? "Denied" : "On hold"} detail={`${zeroCredit.provider} · ${zeroCredit.costClass} · ${zeroCredit.reason}`} tone={zeroCredit.state === "allow" ? "good" : "warn"} />
        <StatusCard label="Model fabric" value={`${routable.length} verified route${routable.length === 1 ? "" : "s"}`} detail={`${routeCoverage}% routable · ${workers.size} worker lane${workers.size === 1 ? "" : "s"}`} tone={routable.length > 0 ? "good" : "neutral"} />
        <StatusCard
          label="Institutional learning"
          value={learning.status === "promoted" ? "verified-outcome" : learning.status === "refused" ? "refused" : "no receipt"}
          detail={learning.status === "promoted" ? `${learning.headline} · confidence ${learning.confidence ?? "n/a"}` : learning.reasonLabel}
          tone={learning.status === "promoted" ? "good" : learning.status === "refused" ? "warn" : "neutral"}
        />
        <StatusCard label="Evolution lane" value="Verified convergence" detail="Stage → verify → canary → pin → converge" tone="good" />
      </div>

      <DissentReceiptPanel receipt={dissentReceipt} />

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
            <div><dt>Browser presentation</dt><dd>Cloudflare candidate · {CLOUDFLARE_WORKSPACE_CANDIDATE} · unverified-cloudflare-static; GitHub Pages export retained</dd></div>
            <div><dt>Host provider</dt><dd>{railwayExactSha ? "railway (server-capable runtime)" : deploymentProvider}</dd></div>
            <div><dt>Deployment URL</dt><dd>{deploymentUrl}</dd></div>
            <div><dt>Git identity</dt><dd><GitBranch size={14} /> {health?.deployment?.gitRef ?? "unknown-ref"} · {shortSha(deploymentCommit)}</dd></div>
            <div><dt>Expected SHA</dt><dd>{shortSha(expectedDeploymentCommit)}</dd></div>
            <div><dt>Promotion mode</dt><dd>{promotionMode}</dd></div>
            <div><dt>Source Truth</dt><dd>protected GitHub main · exact-head Verify contexts</dd></div>
            <div><dt>Deployment Truth</dt><dd>{deploymentProvider} · actual {shortSha(deploymentCommit)} · expected {shortSha(expectedDeploymentCommit)}</dd></div>
            <div><dt>Live-Runtime Truth</dt><dd>{liveOk ? "observed /api/live" : healthError ? "unavailable" : "pending"} · observational only</dd></div>
            <div><dt>Deployment convergence</dt><dd>{deploymentConvergence}</dd></div>
            <div><dt>Pin policy</dt><dd>MAHORAGA_EXPECTED_GIT_SHA · after Verify Mahoraga on main; verified run SHA; not Railway GitHub status; Wait for CI disabled</dd></div>
            <div><dt>CI publish/steward</dt><dd>self-hosted Linux/X64 lane (informational)</dd></div>
            <div><dt>Cloudflare cognition</dt><dd>{cognitionObserved ? "Observed" : "Unverified"} · receipt-gated providerCognitionVerified · never from /api/ready</dd></div>
            <div><dt>No Railway fallback</dt><dd>{noRailwayVerified ? "Verified" : "Unproven"} · Railway rollback anchor · x-bypass-applied fail-closed</dd></div>
            <div><dt>Traffic authority</dt><dd>Separate / unverified · trafficAuthorityVerified unpromoted</dd></div>
            <div><dt>Billing Read token</dt><dd>optional CLOUDFLARE_BILLING_READ_TOKEN · subscriptions read only · 403 cloudflare-subscriptions-billing-read-required-403 fail-closed · no secret values</dd></div>
            <div><dt>Routing authority</dt><dd>{health?.routing?.authority ?? "paired-mahoraga-core"}</dd></div>
            <div><dt>Paid fallback</dt><dd>{paidFallback ? "enabled" : "disabled"}</dd></div>
            <div><dt>Cloud boundary</dt><dd>{health?.boundaries?.executionPlane ?? "client-shell-with-owner-paired-core"}</dd></div>
            <div><dt>Relay plaintext</dt><dd>{health?.boundaries?.relaySeesPlaintext === true ? "unexpected" : "not visible"}</dd></div>
            <div><dt>Runtime DB target</dt><dd>{runtimeDatabase}</dd></div>
            <div><dt>Interaction readiness</dt><dd>{interaction.ready ? "ready" : "blocked"} · {interaction.provider} · {interaction.canary}</dd></div>
            <div><dt>Zero-credit admission</dt><dd>{zeroCredit.state} · {zeroCredit.costClass} · no paid fallback</dd></div>
            <div><dt>Billing evidence</dt><dd>{zeroCredit.billingClass} · {zeroCredit.lastVerifiedAt ?? "verification unavailable"}</dd></div>
            <div><dt>Liveness/readiness</dt><dd>{readiness?.status ?? "unobserved"} · SHA {shortSha(readiness?.sha)} · durableState {readiness?.durableState ?? "unavailable"} · execution observation only</dd></div>
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
            <li><span>4</span><div><strong>Pin</strong><small>Promote Railway to the verified Verify Mahoraga run SHA after main</small></div></li>
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
          <strong>Institutional learning</strong>
          <p>{learning.headline}. {learning.reasonLabel}. Provenance {learning.provenance ?? "none"}. Calibrated confidence {learning.confidence ?? "n/a"}. Public evidence refs: {learning.evidenceRefs.length ? learning.evidenceRefs.join(", ") : "none"}. {learning.privacyNote}</p>
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
