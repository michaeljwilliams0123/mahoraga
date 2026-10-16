"use client";

import { useState } from "react";
import { projectAcceptanceEvidence } from "@/lib/acceptance-evidence";
import { AcceptanceEvidenceCards } from "./AcceptanceEvidenceCards";
import { ExecutionBrokerCard } from "./ExecutionBrokerCard";
import { Activity, GitBranch, Link2, ShieldCheck } from "lucide-react";
import { projectInteractionReadiness, projectZeroCreditAdmission } from "@/lib/interaction-readiness";
import { projectCognitiveLearningSurface } from "@/lib/cognitive-learning-surface";
import { projectHardZeroHold } from "@/lib/hard-zero-hold";
import { projectInteractionTruth } from "@/lib/interaction-truth";
import type { CollectiveDissentReceipt } from "@/lib/dissent-receipt";
import type { CockpitViewProps, HardZeroQuotaAction, HardZeroQuotaReceipt, Health, SanitizedAcceptanceReceipt } from "../workspace/workspace-types";
import { ConnectorRoutingCards } from "./ConnectorRoutingCards";
import { InteractionTruthCards } from "./InteractionTruthCards";
import { TransformationProvenanceCards } from "./TransformationProvenanceCards";
import { BrokerLeaseCards } from "./BrokerLeaseCards";
import { UndiciSecurityBumpCard } from "./UndiciSecurityBumpCard";
import { DataverseCliBumpCard } from "./DataverseCliBumpCard";
import { SourceMapJsBumpCard } from "./SourceMapJsBumpCard";
import { LocalAiDevOnlyCard } from "./LocalAiDevOnlyCard";
import { ZeroCreditModelUrlBoundaryCard } from "./ZeroCreditModelUrlBoundaryCard";
import { BotPushPublicationCard } from "./BotPushPublicationCard";
import { SovereignSchedulerQueueCard } from "./SovereignSchedulerQueueCard";
import { ProviderRenewalWatchdogCard } from "./ProviderRenewalWatchdogCard";
import { PairedWorkspacePublicationCard } from "./PairedWorkspacePublicationCard";
import { StaticWorkspaceParityCard } from "./StaticWorkspaceParityCard";
import { PagesWorkspaceStatusCard } from "./PagesWorkspaceStatusCard";
import { DissentReceiptPanel } from "./DissentReceiptPanel";
import { PlannerReceiptPanel } from "./PlannerReceiptPanel";
import { PredictionBacktestCards } from "./PredictionBacktestCards";
import { PredictionLearningPanel } from "./PredictionLearningPanel";
import { TelemetrySparkline } from "./TelemetrySparkline";
import { PagesFrameContractCard } from "./PagesFrameContractCard";
import { PagesSameOriginSessionCard } from "./PagesSameOriginSessionCard";
import { StaleDisconnectSelfHealCard } from "./StaleDisconnectSelfHealCard";
import { TelemetryStreamBoundCard } from "./TelemetryStreamBoundCard";
import { OpenAiRouteCreditsCard } from "./OpenAiRouteCreditsCard";
import { useRuntimeReadiness, readinessSourceSha } from "@/lib/use-runtime-readiness";

const CLOUDFLARE_WORKSPACE_CANDIDATE = "https://mahoraga-workspace-candidate.mahoraga-mjw0123.workers.dev";
const EXPECTED_PROVIDER_ID = "cloudflare-workers-ai";
const EXPECTED_MODEL_ID = "@cf/zai-org/glm-4.7-flash";
const HARD_ZERO_ACTIONS = new Set<HardZeroQuotaAction>([
  "dispatch-hard-zero",
  "quota-hold-until-utc-reset",
  "resume-queued",
  "refuse-paid-route",
]);

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

  const candidate = nested.find(entry => entry.kind === "cloudflare-execution-runtime-acceptance");
  const bypassApplied = nested.some(entry => entry["x-bypass-applied"] === true);
  const evidence = projectAcceptanceEvidence(bypassApplied ? { ...candidate, "x-bypass-applied": true } : candidate, {
    expectedSha: health?.deployment?.expectedCommitSha,
    deploymentSha: health?.deployment?.commitSha,
  });
  return {
    providerCognitionVerified: evidence.providerCognitionVerified,
    noRailwayFallbackVerified: evidence.noRailwayFallbackVerified,
    trafficAuthorityVerified: evidence.trafficAuthorityVerified,
    ...(evidence.providerId ? { providerId: evidence.providerId } : {}),
    ...(evidence.modelId ? { modelId: evidence.modelId } : {}),
    "x-bypass-applied": bypassApplied, bypassApplied,
  };

}

function parseHardZeroQuota(health: Health | null): HardZeroQuotaReceipt | null {
  const candidates = [
    health?.hardZeroQuota,
    health?.creditFreeQuota,
    health?.runtime?.hardZeroQuota,
    health?.runtime?.creditFreeQuota,
    health?.runtime?.workersAi,
    health?.autonomy?.hardZeroQuota,
    health?.autonomy?.creditFreeQuota,
    health?.autonomy?.workersAi,
  ];
  for (const candidate of candidates) {
    if (!candidate || !HARD_ZERO_ACTIONS.has(candidate.nextAction as HardZeroQuotaAction)) continue;
    if (candidate.creditCost !== 0 || candidate.paidFallback !== false) continue;
    return candidate;
  }
  return null;
}

function hardZeroActionLabel(action: HardZeroQuotaAction | undefined) {
  if (action === "dispatch-hard-zero") return "Dispatch hard-zero";
  if (action === "quota-hold-until-utc-reset") return "Hold until UTC reset";
  if (action === "resume-queued") return "Resume queued";
  if (action === "refuse-paid-route") return "Refuse paid route";
  return "Unobserved";
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
  relay = null,
  onRequestPairing,
  onOpenOperations,
  onOpenConnections,
}: CockpitViewProps) {
  const routable = runtimeCapabilities.filter((capability) => capability.routable && capability.enabled !== false);
  const workers = new Set(runtimeCapabilities.flatMap((capability) => capability.workerIds));
  const deploymentProvider = health?.deployment?.provider ?? "unknown";
  const pagesRecoveryEligible = deploymentProvider === "github-pages";
  const deploymentCommit = health?.deployment?.commitSha;
  const expectedDeploymentCommit = health?.deployment?.expectedCommitSha;
  const deploymentConvergence = deploymentCommit && expectedDeploymentCommit
    ? deploymentCommit === expectedDeploymentCommit ? "Current" : "Drift"
    : "Unverified";
  const deploymentEnvironment = health?.deployment?.environment ?? "unknown";
  const promotionMode = health?.deployment?.promotion ?? "unverified";
  const deploymentUrl = health?.deployment?.url ?? "unavailable";
  const cloudflareProvider = deploymentProvider.startsWith("cloudflare");
  const cloudflareExactMain = cloudflareProvider
    && promotionMode === "exact-main-cloudflare"
    && deploymentConvergence === "Current";
  const railwayRetired = deploymentProvider === "railway";
  const deploymentTruthLabel = cloudflareExactMain
    ? "Cloudflare exact-main"
    : cloudflareProvider
      ? "Cloudflare candidate"
    : railwayRetired
      ? "Railway retired"
      : deploymentProvider === "vercel"
        ? "Vercel retired"
      : deploymentProvider;
  const deploymentDetail = cloudflareExactMain
    ? `Exact-main deployment and acceptance require Ubuntu + Windows Verify · traffic authority remains separate · ${deploymentEnvironment}`
    : cloudflareProvider
      ? `Non-authoritative presentation candidate · exact-main deployment and acceptance not proven · ${deploymentEnvironment}`
    : railwayRetired
      ? `Legacy evidence only · zero-route · zero-influence · zero-fallback · zero-authority · do not repair or revive · ${deploymentEnvironment}`
      : deploymentProvider === "vercel"
      ? `Retired · observation-only · no origin, gateway, traffic, or runtime authority · ${deploymentEnvironment}`
      : `${deploymentProvider} · ${deploymentEnvironment}`;
  const paidFallback = health?.routing?.automaticPaidFallback === true;
  const routeCoverage = runtimeCapabilities.length === 0 ? 0 : Math.round((routable.length / runtimeCapabilities.length) * 100);
  const runtimeDatabase = health?.runtime?.databaseTarget?.basename ?? "paired core required";
  const managementPlaneReady = health?.studio?.managementPlaneReady === true;
  const delegationRuntimeReady = health?.studio?.delegationRuntimeReady === true;
  const studioFullyReady = managementPlaneReady && delegationRuntimeReady;
  const productName = health?.product ?? "Mahoraga";
  const buildVersion = health?.build?.version ?? health?.version ?? "unavailable";
  const pagesBridgeOrigin = process.env.NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN?.trim() ?? "";
  const interaction = projectInteractionReadiness(runtimeCapabilities);
  const zeroCredit = projectZeroCreditAdmission(runtimeCapabilities);
  const predictiveRoute = runtimeCapabilities.find((capability) => capability.capability === "cognitive.predict");
  const predictiveRouteReady = coreReady
    && predictiveRoute?.enabled !== false
    && predictiveRoute?.routable === true
    && predictiveRoute?.costClass === "deterministic";
  const learning = projectCognitiveLearningSurface(health?.cognitiveLearning);
  const liveOk = Boolean(health?.ok) && !healthError;
  const acceptance = parseSanitizedAcceptance(health);
  const hardZeroQuota = parseHardZeroQuota(health);
  const holdProvenance = projectHardZeroHold(hardZeroQuota ?? null);
  const hardZeroAction = holdProvenance.status === "unverified" ? undefined : hardZeroQuota?.nextAction;
  const hardZeroLabel = holdProvenance.status === "unverified" ? "Hold provenance unverified" : hardZeroActionLabel(hardZeroAction);
  const quotaHolding = hardZeroAction === "quota-hold-until-utc-reset";
  const cognitionObserved = acceptance.providerCognitionVerified === true;
  const noRailwayVerified = acceptance.noRailwayFallbackVerified === true;
  const cognitionDetail = cognitionObserved
    ? `${acceptance.providerId ?? EXPECTED_PROVIDER_ID} · ${acceptance.modelId ?? EXPECTED_MODEL_ID} · receipt-gated`
    : "Unverified until providerCognitionVerified is true on sanitized health/runtime metadata; never inferred from /api/ready";
  const noRailwayDetail = noRailwayVerified
    ? "Verified no Railway fallback on sanitized receipt; Railway remains legacy evidence only with zero route, influence, fallback, or authority"
    : "Unproven until noRailwayFallbackVerified is true; Railway still has zero route, influence, fallback, or authority";
  const readinessState = useRuntimeReadiness(relay, readinessSourceSha(health), coreReady);
  const readiness = readinessState.readiness;
  const dissentReceipt = (health as { collectiveDissent?: CollectiveDissentReceipt } | null)?.collectiveDissent ?? null;
  const interactionTruth = projectInteractionTruth({
    interaction: health?.runtime?.interactionTruth ?? health?.interactionTruth,
    delivery: health?.runtime?.deliveryTruth ?? health?.deliveryTruth,
  });



  const readinessOk = readiness?.status === "ready";
  const readyOk = coreReady && readinessOk;

  return (
    <section className="connection-panel eclipse-console" aria-label="Control Center">
      <header className="eclipse-header">
        <div>
          <span className="eyebrow">Governed adaptive intelligence</span>
          <h2>Control Center</h2>
          <p>Cloudflare is the native browser and execution surface. Source, deployment, execution readiness, cognition readiness, and traffic authority remain separate and fail closed. Railway is legacy evidence only: zero-route, zero-influence, zero-fallback, zero-authority; do not repair or revive it. 7.0.0-alpha.2 is build provenance only. Windows 3.6.0 stays untouched.</p>
        </div>
        <span className={coreReady ? "eclipse-live-state paired" : "eclipse-live-state"}>
          <span aria-hidden="true" />
          {readyOk ? "Ready · core paired" : coreReady ? "Paired · live pending" : "Workspace published · unpaired"}
        </span>
      </header>

      <p className="eclipse-readiness-note" role="status">
        Cloudflare workspace candidate: {CLOUDFLARE_WORKSPACE_CANDIDATE}. exact-main provenance is unverified until an exact-SHA acceptance receipt binds the published UI and accepted runtime. Candidate publication and runtime acceptance remain separate; paired status stays unverified until that receipt is observed. /api/ready is observational execution/durable-state evidence only and never grants traffic/domain authority.
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
          <UndiciSecurityBumpCard />
          <DataverseCliBumpCard />
          <SourceMapJsBumpCard />
          <OpenAiRouteCreditsCard capabilities={runtimeCapabilities} />
          <LocalAiDevOnlyCard />
          <ZeroCreditModelUrlBoundaryCard />
          <BotPushPublicationCard />
          <SovereignSchedulerQueueCard />
          <ProviderRenewalWatchdogCard />
          <PairedWorkspacePublicationCard />
          <StaticWorkspaceParityCard health={health} />
          <PagesWorkspaceStatusCard coreReady={coreReady} bridgeOrigin={pagesBridgeOrigin} />
          <StatusCard label="Next dependency provenance" value="16.3.8 (from 16.3.3)" detail="Security fix for GHSA-vcvr-r3jv-pc5j (next/og ImageResponse RCE) · cloud-app/package.json pin only; does not prove deployed runtime remediation or production traffic authority" />
        <StatusCard label="Source Truth" value="Protected GitHub main" detail="Source authority only · exact-head Verify (ubuntu-latest + windows-latest) · edge-convergence foundation #665" tone="good" />
        <StatusCard label="Deployment Truth" value={deploymentTruthLabel} detail={`${deploymentConvergence} · actual ${shortSha(deploymentCommit)} · expected ${shortSha(expectedDeploymentCommit)}`} tone={cloudflareExactMain ? "good" : deploymentConvergence === "Drift" || railwayRetired ? "warn" : "neutral"} />
        <StatusCard label="Live-Runtime Truth" value={liveOk ? "Observed live" : healthError ? "Unavailable" : "Pending"} detail="/api/live observation only · does not prove source or deployment convergence" tone={liveOk ? "good" : healthError ? "warn" : "neutral"} />
        <StatusCard label="Ready / pairing" value={readyOk ? "Ready" : coreReady ? "Paired, execution pending" : "Ready to pair"} detail={readyOk ? `Execution ready at ${shortSha(readiness?.sha)} with paired core` : "LIVE_OK alone is not Ready"} tone={readyOk ? "good" : "neutral"} />
        <StaleDisconnectSelfHealCard />
        <TelemetryStreamBoundCard />
        <StatusCard
          label="Pages owner-connection recovery"
          value={pagesRecoveryEligible ? "Eligible / fail-closed" : "Unavailable / inactive"}
          detail={pagesRecoveryEligible
            ? "Deployment provider is github-pages, so recovery is eligible only while the Pages relay is unpaired or in error. Handshake timeout tears down stale bridge frames after preserving the diagnostic code; recovery requests one fresh connection on visible return, focus, or online, never replays tasks, and never submits authentication material. Eligibility is not proof that recovery fired, execution is ready, or traffic authority exists. workflow_run verification notifications use a run-ID concurrency group; push/manual stay per-ref."
            : `Pages recovery subscription is inactive because deployment provider is ${deploymentProvider}. Policy remains fail-closed: no task replay, no authentication-material submission, and no recovery/execution/traffic-authority claim is inferred outside github-pages.`}
          tone={pagesRecoveryEligible ? "neutral" : "warn"}
        />
        <StatusCard
          label="Telemetry"
          value="telemetry unavailable"
          detail="telemetry-session-unavailable until a genuine owner-authenticated transport exists · no browser bearer from localStorage · TELEMETRY_STREAM_TOKEN optional and not uploaded · no live Railway fallback · not traffic authority"
          tone="warn"
        />
        <StatusCard label="Execution readiness" value={readinessOk ? "Observed ready" : "Not proven"} detail={`Observation ${readinessState.phase} · SHA ${shortSha(readiness?.sha)} · durable ${readiness?.durableState ?? "unavailable"} · cloudflare-execution-runtime is hop identity only`} tone={readinessOk ? "good" : "neutral"} />
        <StatusCard label="Cloudflare cognition" value={cognitionObserved ? "Observed" : "Unverified"} detail={cognitionDetail} tone={cognitionObserved ? "good" : "neutral"} />
        <StatusCard
          label="Native Verify dispatch grants"
          value="Proven before deployment (observational)"
          detail="Merged #1138 proves installed GitHub App grants via two repository-scoped tokens (contents:write+pull_requests:write+metadata:read and actions:write+contents:read+metadata:read) that are immediately revoked. Predeployment gate in cloudflare-execution-runtime.yml blocks candidate deployment if grants are missing or mismatched. Fail-closed; not traffic authority, not production success, and not runtime readiness."
          tone="neutral"
        />
        <StatusCard
          label="Uploaded snippet completeness"
          value="Envelope ignored (observational)"
          detail="Merged #986 ignores workspace-injected uploaded snippet envelopes when choosing required scenario sections. Numbered source content in a staged snippet is not an incomplete multi-scenario answer. Incomplete detection still applies to the actual user prompt. Not execution authority, not cognition proof, and not traffic authority."
          tone="neutral"
        />
        <StatusCard
          label="Predictive scenario route"
          value={predictiveRouteReady ? "Paired deterministic route" : "Unavailable / unobserved"}
          detail={predictiveRouteReady
            ? "cognitive.predict · explicit /predict only · zero-credit deterministic hypothetical transition with predicted state + uncertainty · not a measured forecast · no traffic-authority grant"
            : "Requires an observed deterministic cognitive.predict route · ordinary chat remains assistant.respond · predictive requests never fall through to the generative provider"}
          tone={predictiveRouteReady ? "good" : "neutral"}
        />
        <ConnectorRoutingCards coreReady={coreReady} runtimeCapabilities={runtimeCapabilities} health={health} />
        <PredictionBacktestCards snapshot={health?.predictionBacktest} />
        <InteractionTruthCards truth={interactionTruth} />
        <ExecutionBrokerCard capabilities={runtimeCapabilities} />
        <AcceptanceEvidenceCards receipt={health?.cloudflareAcceptance ?? health?.productionAcceptance ?? health?.acceptance ?? health?.receipt} expectedSha={expectedDeploymentCommit} deploymentSha={deploymentCommit} />
        <TransformationProvenanceCards />
        <BrokerLeaseCards />
        <DissentReceiptPanel receipt={dissentReceipt} />
        <PlannerReceiptPanel />
        <PredictionLearningPanel />
        <PagesFrameContractCard />
        <PagesSameOriginSessionCard />
        <StatusCard label="Hard-zero quota route" value={hardZeroLabel} detail={`creditCost ${hardZeroQuota?.creditCost ?? 0} · paidFallback ${String(hardZeroQuota?.paidFallback ?? false)} · Next UTC reset ${hardZeroQuota?.nextUtcReset ?? "unobserved"} · Same idempotency key · does not grant traffic authority`} tone={quotaHolding ? "warn" : "neutral"} />
        <StatusCard label="Hold provenance" value={holdProvenance.status === "verified" ? "Verified hold" : "Unverified"} detail={holdProvenance.detail} tone={holdProvenance.status === "verified" ? "good" : "neutral"} />
        <StatusCard label="No Railway fallback" value={noRailwayVerified ? "Verified" : "Unproven"} detail={noRailwayDetail} tone={noRailwayVerified ? "good" : "neutral"} />
        <StatusCard label="Traffic authority" value="Separate / unverified" detail="Never inferred from /api/ready; trafficAuthorityVerified stays unpromoted even if acceptance or ready is true" tone="neutral" />
        <StatusCard label="CI publish / steward" value="self-hosted Linux/X64" detail="Informational only · exact-main Cloudflare acceptance after Ubuntu + Windows Verify remains separate" tone="neutral" />
        <StatusCard
          label="Provider admission restore retry"
          value="Observational / fail-closed"
          detail="Retry only transient 503 responses against the same verified hard-zero billing attestation. Bounded attempts and validated delay. Persistent failure remains fail-closed. accept-provider-restore-503 is not traffic authority."
          tone="neutral"
        />
        <StatusCard
          label="Codespaces development environment"
          value="Optional / non-authoritative"
          detail="Node 24 developer convenience from #812. Locked dependencies only. Exposes no ports. Starts no Mahoraga service. GitHub metering and quota apply. GitHub and Cloudflare remain production authority. GitLab read-only. Railway non-routing. Not a production host, inference provider, lifecycle automation, self-patching authority, deployment lane, or routing change. Supplies no production authentication material."
          tone="neutral"
        />
      </div>

      <div className="eclipse-telemetry">
        <TelemetrySparkline />
        <dl>
          <div><dt>Live</dt><dd>{liveOk ? "ok" : "pending"}</dd></div>
          <div><dt>Ready</dt><dd>{readyOk ? "ready" : "not proven"}</dd></div>
          <div><dt>Execution readiness</dt><dd>{readinessOk ? "observed" : "not proven"} · {shortSha(readiness?.sha)} · {readiness?.durableState ?? "unavailable"}</dd></div>
          <div><dt>Deployment convergence</dt><dd>{deploymentConvergence}</dd></div>
          <div><dt>Pin policy</dt><dd>MAHORAGA_EXPECTED_GIT_SHA · exact-main Cloudflare deployment and acceptance after Ubuntu + Windows Verify · mismatch fails closed</dd></div>
          <div><dt>CI publish/steward</dt><dd>self-hosted Linux/X64 lane (informational)</dd></div>
          <div><dt>Provider admission renewal</dt><dd>gateway-owned one-minute cron · hard-zero renewal · verified main deployment preserves renewal continuity; sensitive values are never displayed · owner workflow is break-glass only · Access-protected · re-prove billing only inside the 30-minute margin · deployment does not own scheduled renewal · never redeploys Workers · observational only, not runtime readiness or production traffic authority, and grants no traffic authority · Railway remains zero-route / zero-influence / zero-fallback / zero-authority</dd></div>
          <div><dt>Cloudflare cognition</dt><dd>{cognitionObserved ? "Observed" : "Unverified"} · receipt-gated providerCognitionVerified · never from /api/ready</dd></div>
          <div><dt>No Railway fallback</dt><dd>{noRailwayVerified ? "Verified" : "Unproven"} · Railway zero-route / zero-influence / zero-fallback / zero-authority · x-bypass-applied fail-closed</dd></div>
          <div><dt>Provider restoration retry</dt><dd>Observational only · transient 503 only · same verified hard-zero billing attestation · bounded attempts and validated delay · persistent failure fails closed · accept-provider-restore-503 is not traffic authority</dd></div>
          <div><dt>Codespaces</dt><dd>Observational developer convenience only · not a production host, inference provider, lifecycle automation, self-patching authority, deployment lane, or routing change · supplies no production authentication material</dd></div>
          <div><dt>Universal interaction envelope</dt><dd>text · structured · file · image · audio · video · event · additive context cannot create a provider route or widen authority</dd></div>
          <div><dt>Global presentation</dt><dd>Locale · timezone · RTL · Accessibility-first · presentation only · not identity or authority</dd></div>
          <div><dt>Device reach</dt><dd>phone · tablet · desktop · embedded · headless · presentation capability only</dd></div>
          <div><dt>Execution ≠ delivery</dt><dd>online · degraded · offline · delivery retry never re-executes</dd></div>
          <div><dt>Protocol negotiation</dt><dd>observational receipt lineage · no authority expansion</dd></div>
          <div><dt>Transformation provenance</dt><dd>frozen deterministic interaction-transformation-receipt · observational only</dd></div>
          <div><dt>Workers</dt><dd>{workers.size}</dd></div>
          <div><dt>Routable</dt><dd>{routeCoverage}%</dd></div>
          <div><dt>Database</dt><dd>{runtimeDatabase}</dd></div>
          <div><dt>Paid fallback</dt><dd>{paidFallback ? "enabled" : "disabled"}</dd></div>
          <div><dt>Deployment URL</dt><dd>{deploymentUrl}</dd></div>
        </dl>
      </div>

      <section className="eclipse-panel eclipse-flow" aria-label="Execution flow">
        <span className="eyebrow">Governed path</span>
        <ol>
          <li><span>1</span><div><strong>Observe</strong><small>Source, deployment, live, ready, and traffic authority stay separate</small></div></li>
          <li><span>2</span><div><strong>Admit</strong><small>Hard-zero quota and provider admission remain fail-closed</small></div></li>
          <li><span>3</span><div><strong>Route</strong><small>Deterministic zero-credit paths first; generative routes stay receipt-gated</small></div></li>
          <li><span>4</span><div><strong>Verify</strong><small>Exact-head Ubuntu + Windows Verify before exact-main acceptance</small></div></li>
          <li><span>5</span><div><strong>Converge</strong><small>Activate through the verified boundary and retain rollback</small></div></li>
        </ol>
      </section>

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
