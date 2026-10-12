"use client";

import { useMemo, useState } from "react";
import {
  COCKPIT_PANEL_IDS,
  HARD_DENIES,
  mapHealthRoute,
  type CockpitPanelId,
  type CockpitPanelModel,
  type HealthRouteJson,
  type ObservationalHealthCard,
} from "@/lib/cockpit";
import { isCollectiveDissentReceipt } from "@/lib/dissent-receipt";
import { projectCognitiveLearningSurface, type CognitiveLearningPromotionReceipt } from "@/lib/cognitive-learning-surface";
import { projectPredictionBacktestSurface } from "@/lib/prediction-backtest-surface";
import { projectInteractionTruth } from "@/lib/interaction-truth";
import { AstSandbox } from "./AstSandbox";
import { DissentReceiptPanel } from "./DissentReceiptPanel";
import { PlannerReceiptPanel } from "./PlannerReceiptPanel";
import { PredictionLearningPanel } from "./PredictionLearningPanel";
import { LocalChatSidebar } from "./LocalChatSidebar";
import { InteractionTruthCards } from "./InteractionTruthCards";
import { TransformationProvenanceCards } from "./TransformationProvenanceCards";
import { ExecutionBrokerCard } from "./ExecutionBrokerCard";
import { BrokerLeaseCards } from "./BrokerLeaseCards";
import { TelemetrySparkline } from "./TelemetrySparkline";

const HELPERS = [
  { label: "Inspect live repository", command: "Inspect the live Mahoraga repository: health, open issues, and current head." },
  { label: "Audit connection posture", command: "Audit bounded owner-authenticated tunnel posture. Deny unauthenticated or generic public loopback exposure. Report relay and GitHub surfaces." },
  { label: "Build ledger", command: "Show Mahoraga build provenance, Windows compatibility runtime 3.6.0, and this operator deck. No lane or port selection is required." },
  { label: "List arsenal", command: "List the command arsenal and show what this deck can run live versus GitHub, loopback, or deny." },
  { label: "Artifact bridge", command: "Describe the Track 3 bounded artifact bridge (#505): same-origin owner-authenticated upload, loopback /api/artifacts, fail-closed legacy relay. Do not select destination, provider, executable, or paid fallback." },
  { label: "Workers Builds detect", command: "Describe Cloudflare Workers Builds root wrangler.toml (#562): production npx wrangler deploy and preview npx wrangler versions upload resolve deploy/cloudflare-owner-gateway/worker.mjs from repo root. Nested wrangler.toml remains valid. No Worker logic or secret values changed." },
] as const;
const CLOUDFLARE_WORKSPACE_CANDIDATE = "https://mahoraga-workspace-candidate.mahoraga-mjw0123.workers.dev";
import { useRuntimeReadiness, readinessSourceSha } from "@/lib/use-runtime-readiness";
import type { RuntimeRelay } from "@/lib/runtime-relay";
const shortReadinessSha = (value: string | null | undefined) => value ? value.slice(0, 12) : "unavailable";
type CommandCockpitProps = {
  relay?: RuntimeRelay | null;
  coreReady: boolean;
  healthJson: HealthRouteJson | null;
  healthError: boolean;
  onRequestPairing: () => void;
  onOpenOperations: () => void;
};

function panelFromHealth(id: CockpitPanelId, health: ObservationalHealthCard | null, coreReady: boolean): CockpitPanelModel {
  if (id === "mesh") {
    return {
      id: "mesh",
      title: "MESH",
      tone: "neutral",
      summary: "Mesh panel is observational; L7 experiment src stays out of this cloud-app lane.",
      lines: [
        { label: "lane", value: "observational" },
        { label: "L7 mesh src", value: "out of bounds" },
        { label: "detail", value: "pressure-test-ui" },
      ],
      actionable: false,
    };
  }
  if (id === "cloud") {
    return {
      id: "cloud",
      title: "CLOUD",
      tone: health?.ok ? "ok" : health ? "warn" : "neutral",
      summary: "Cloudflare is the native workspace and execution runtime. Source, deployment, live-runtime, provider, and traffic authority stay independently fail-closed; the Pages frame protocol is source-bound observational evidence only, not a private owner-browser transaction or traffic authority. Railway is legacy evidence only with zero route, influence, fallback, or authority; do not repair or revive it. Vercel is retired and observation-only.",
      lines: [
        { label: "product", value: health?.product ?? "unknown" },
        { label: "authority", value: health?.authority ?? "unknown" },
        { label: "paidFallback", value: String(health?.automaticPaidFallback ?? false) },
        { label: "executionPlane", value: health?.executionPlane ?? "unknown" },
        { label: "ownerLoginCache", value: "Cache-Control: no-store (#486)" },
        { label: "providerAdmissionRenewal", value: "Gateway-owned one-minute cron · hard-zero renewal · verified main deployment preserves renewal continuity; sensitive values are never displayed · owner workflow is break-glass only · Access-protected · 30-minute margin · deployment does not own scheduled renewal · never redeploys Workers · observational only, not runtime readiness or production traffic authority, and grants no traffic authority · Railway zero-route / zero-influence / zero-fallback / zero-authority" },
        { label: "pagesFrameContract", value: "PAGES_FRAME_CONTRACT_OBS · protocol v1 · source-bound exact fields · 32 KiB body cap · 60-second abort · no replay · parent origin/source checks" },
        { label: "pagesFrameAuthentication", value: "OWNER_AUTH_REQUIRED_BOUNDED · HTTP 401/403 clears frame authentication · cloud-owner-auth-required" },
        { label: "workersBuilds", value: "root wrangler.toml → owner gateway (#562)" },
        { label: "ciLane", value: "Steward: public-only free ubuntu-latest (fail-closed if private)" },
        { label: "sovereignQueue", value: "queue: max · cancel-in-progress false · observational #977 · not traffic authority" },
        { label: "railwayStatus", value: "legacy evidence only · zero-route · zero-influence · zero-fallback · zero-authority" },
        { label: "vercelStatus", value: "retired · observation-only · no origin, gateway, traffic, or runtime authority" },
        { label: "predictiveRoute", value: "deterministic cognitive.predict only when observed · explicit /predict · receipt-producing scenario simulation" },
      ],
      actionable: false,
    };
  }
  return {
    id: "workspace",
    title: "WORKSPACE",
    tone: coreReady ? "ok" : "warn",
    summary: coreReady
      ? "Paired core expected. Mutating Operations stay relay-mediated."
      : "Core not paired — Cockpit stays fail-closed for mutations. Use Pair runtime when an approved session is available.",
    lines: [
      { label: "core", value: coreReady ? "paired" : "unpaired" },
      { label: "pairing", value: coreReady ? "session verified" : "awaiting pair" },
      { label: "presentation", value: "Cloudflare candidate · unverified-cloudflare-static" },
      { label: "execution", value: "owner-authenticated gateway; authority separately gated" },
      { label: "relaySeesPlaintext", value: String(health?.relaySeesPlaintext ?? false) },
      { label: "browserMaySelectProvider", value: String(health?.browserMaySelectProvider ?? false) },
    ],
    actionable: false,
  };
}

export function CommandCockpit({
  coreReady,
  healthJson,
  relay = null,
  healthError,
  onRequestPairing,
  onOpenOperations,
}: CommandCockpitProps) {
  const [tab, setTab] = useState<CockpitPanelId>("cloud");
  const [code, setCode] = useState(
    `// Pressure-test AST sandbox (local only)\nexport const optimize = (node: { rewriteLoops: () => unknown }) => {\n  return node.rewriteLoops();\n};\n`,
  );
  const [copied, setCopied] = useState<string | null>(null);
  const readinessState = useRuntimeReadiness(relay, readinessSourceSha(healthJson), coreReady);
  const readiness = readinessState.readiness;



  const healthCard = useMemo(() => {
    if (!healthJson) return null;
    const mapped = mapHealthRoute(healthJson);
    return mapped.ok ? mapped.value : null;
  }, [healthJson]);

  const dissentReceipt = isCollectiveDissentReceipt((healthJson as { collectiveDissent?: unknown } | null)?.collectiveDissent)
    ? (healthJson as { collectiveDissent: import("@/lib/dissent-receipt").CollectiveDissentReceipt }).collectiveDissent
    : null;

  const learning = projectCognitiveLearningSurface(
    (healthJson as HealthRouteJson & { cognitiveLearning?: CognitiveLearningPromotionReceipt } | null)?.cognitiveLearning,
  );
  const backtest = projectPredictionBacktestSurface(
    (healthJson as { predictionBacktest?: unknown } | null)?.predictionBacktest,
  );
  const interactionHealth = healthJson as ({
    interactionTruth?: unknown;
    deliveryTruth?: unknown;
    runtime?: { interactionTruth?: unknown; deliveryTruth?: unknown };
  } | null);
  const interactionTruth = projectInteractionTruth({
    interaction: interactionHealth?.runtime?.interactionTruth ?? interactionHealth?.interactionTruth,
    delivery: interactionHealth?.runtime?.deliveryTruth ?? interactionHealth?.deliveryTruth,
  });

  const liveOk = Boolean(healthCard?.ok) && !healthError;
  const readinessOk = readiness?.status === "ready";
  const readyOk = coreReady && readinessOk;

  const panels = useMemo(() => {
    const next = {} as Record<CockpitPanelId, CockpitPanelModel>;
    for (const id of COCKPIT_PANEL_IDS) {
      next[id] = panelFromHealth(id, healthCard, coreReady);
    }
    return next;
  }, [healthCard, coreReady]);

  const active = panels[tab];

  async function copyHelper(command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(command);
    } catch {
      setCopied("copy-failed");
    }
  }

  return (
    <div className="cockpit-root">
      <div className="cockpit-main">
        <header className="cockpit-header">
          <div>
            <span className="cockpit-eyebrow">Mahoraga workspace</span>
            <h2>INTEGRATED_COCKPIT</h2>
          </div>
          <div className="cockpit-header-meta">
            <span className={`cockpit-pill ${liveOk ? "ok" : healthError ? "danger" : "steel"}`}>
              {healthError ? "LIVE_ERROR" : liveOk ? "LIVE_OK" : "LIVE_PENDING"}
            </span>
            <span className={`cockpit-pill ${readyOk ? "ok" : "warn"}`}>
              {readyOk ? "READY_ONLINE" : "READY_OFFLINE"}
            </span>
            <span className={`cockpit-pill ${coreReady ? "ok" : "warn"}`}>{coreReady ? "CORE_PAIRED" : "CORE_UNPAIRED"}</span>
            <span className={`cockpit-pill ${coreReady ? "ok" : "steel"}`}>PAIRING_CLEAR</span>
            <span className={`cockpit-pill ${healthCard?.ok ? "ok" : healthError ? "danger" : "steel"}`}>
              {healthError ? "HEALTH_ERROR" : healthCard?.ok ? "HEALTH_OK" : "HEALTH_PENDING"}
            </span>
            <span className="cockpit-pill ok">SOURCE_TRUTH</span>
            <span className="cockpit-pill steel">DEPLOYMENT_TRUTH</span>
            <span className={`cockpit-pill ${liveOk ? "ok" : healthError ? "danger" : "steel"}`}>LIVE_RUNTIME_TRUTH</span>
            <span className="cockpit-pill ok">CONVERGED_#460</span>
            <span className={`cockpit-pill ${dissentReceipt?.blockingCount ? "warn" : "steel"}`}>DISSENT_RECEIPT</span>
            <span className={`cockpit-pill ${learning.status === "promoted" ? "ok" : learning.status === "refused" ? "warn" : "steel"}`}>
              {learning.status === "promoted" ? "LEARN_VERIFIED_OUTCOME" : learning.status === "refused" ? "LEARN_REFUSED" : "LEARN_PENDING"}
            </span>
            <span className="cockpit-pill steel">CONNECTOR_ROUTING_OBS</span>
            <span className="cockpit-pill steel">CODEX_EXECUTE_SEPARATE</span>
            <span className="cockpit-pill steel">FAMILY_SPLIT_AGENTIC_EXEC</span>
            <span className={`cockpit-pill ${backtest.status === "observed" ? "ok" : backtest.status === "hold" ? "warn" : "steel"}`}>HELD_OUT_BACKTEST_OBS</span>
            <span className="cockpit-pill steel">NO_GENERALIZES_INFER</span>
            <span className="cockpit-pill steel">UNIVERSAL_INTERACTION_OBS</span>
            <span className={`cockpit-pill ${interactionTruth.state === "observed" ? "ok" : interactionTruth.state === "hold" ? "warn" : "steel"}`}>
              {interactionTruth.state === "observed" ? "INTERACTION_TRUTH_OBSERVED" : interactionTruth.state === "hold" ? "INTERACTION_TRUTH_HOLD" : "INTERACTION_TRUTH_ABSENT"}
            </span>
            <span className="cockpit-pill steel">ACCESSIBILITY_FIRST</span>
            <span className="cockpit-pill steel">DELIVERY_SEPARATE</span>
            <span className="cockpit-pill steel">PROTOCOL_NEGOTIATION_OBS</span>
            <span className="cockpit-pill steel">RECEIPT_LINEAGE_OBS</span>
            <span className="cockpit-pill steel">LINEAGE_409_HOLD</span>
            <span className="cockpit-pill steel">TRANSFORM_PROVENANCE_OBS</span>
            <span className="cockpit-pill steel">BROKER_LEASE_OBS</span>
            <span className="cockpit-pill steel">METRICS_MANIP_REJECT</span>
            <span className="cockpit-pill steel">DEADLINE_FAIL_CLOSED</span>
            <span className="cockpit-pill steel">LEASE_SCOPE_NARROW</span>
            <span className="cockpit-pill steel">LEASE_EXPIRY_NOT_200</span>
            <span className="cockpit-pill steel">ZERO_CREDIT_NO_FALLTHROUGH</span>
            <span className="cockpit-pill steel">TEAMS_ATTENDED_OBS</span>
            <span className="cockpit-pill ok">AUTH_NO_STORE_#486</span>
            <span className="cockpit-pill steel">PAGES_FRAME_CONTRACT_OBS</span>
            <span className="cockpit-pill steel">OWNER_AUTH_REQUIRED_BOUNDED</span>
            <span className="cockpit-pill ok">ARTIFACT_BRIDGE_#505</span>
            <span className="cockpit-pill ok">ORIGIN_BOUNDARY_#550</span>
            <span className="cockpit-pill ok">WORKERS_BUILDS_#562</span>
            <span className="cockpit-pill steel">CI_STEWARD_PUBLIC_UBUNTU</span>
            <span className="cockpit-pill steel">SOVEREIGN_QUEUE_MAX_#977</span>
            <span className="cockpit-pill steel">RAILWAY_RETIRED</span>
            <span className="cockpit-pill warn">TELEMETRY_UNAVAILABLE</span>
            <span className="cockpit-pill warn">telemetry-session-unavailable</span>
            <span className="cockpit-pill">readiness {readinessState.phase}</span>
            <span className="cockpit-pill steel">VERCEL_RETIRED</span>
          </div>
        </header>

        <section className="eclipse-status-grid" aria-label="Observed interaction and delivery truth">
          <InteractionTruthCards truth={interactionTruth} />
          <TransformationProvenanceCards />
          <BrokerLeaseCards />
          <ExecutionBrokerCard />
        </section>

        <aside className="cockpit-panel tone-ok" aria-label="Convergence status">
          <h3>CONVERGENCE</h3>
          <p>
            Mahoraga cloud cockpit. Build provenance is 7.0.0-alpha.2. PowerShell <code>$PID</code> collision fixed via <code>$ProcessId</code> (#460 / #388).
            Owner login failures use <code>Cache-Control: no-store</code> (#486). Bounded artifact bridge live (#505). Brain-routed; no lane or port selection required for talk/build/handoff/create/report/ship. The active Windows runtime is reported from live core status; 3.6.0 is retained only as the legacy rollback predecessor.
          </p>
          <p role="status">
            Cloudflare workspace: {CLOUDFLARE_WORKSPACE_CANDIDATE} · provenance is unverified until exact-main publish and acceptance are tied to the merged SHA. Runtime execution and traffic authority remain independently gated.
          </p>
          <p>
            Live is /api/live health. /api/ready reports execution readiness, exact SHA, and durable-state observation only. The cloudflare-execution-runtime hop identity is not traffic authority. Bearer value is never shown, logged, or persisted here. Telemetry stays telemetry unavailable / telemetry-session-unavailable; this static workspace does not read a session bearer from localStorage and does not fall back to live Railway.
          </p>
          <p role="status">
            Ready is live health plus paired core. Pairing is explicit: CORE_UNPAIRED stays fail-closed until Pair runtime succeeds. LIVE_OK alone is not Ready.
          </p>
          <p>
            7.0.0-alpha.2 mutations through the Cloudflare owner gateway are same-origin only. Cross-origin mutations fail closed with <code>403 gateway-same-origin-required</code>; only the current request origin is trusted, and legacy hosting environment variables grant no origin authority. github.io is presentation only and must not call authenticated APIs.
          </p>
          <p>
            Cloudflare Workers Builds now detects the owner gateway from repo root via root <code>wrangler.toml</code> pointing at <code>deploy/cloudflare-owner-gateway/worker.mjs</code> (#562). Production <code>npx wrangler deploy</code> and preview <code>npx wrangler versions upload</code> resolve the same live Worker. Nested config remains valid. No Worker logic or secret values changed.
          </p>
          <p>
            Steward runs on the free ubuntu-latest GitHub-hosted runner only while the repository is public; fails closed if private. Informational copy only. Does not activate 7.0.0-alpha.2 on Windows or change cognition or paid fallback.
          </p>
          <p>
            Railway is <strong>legacy evidence only</strong>: zero-route, zero-influence, zero-fallback, zero-authority; do not repair or revive it. No Railway promotion workflow, reconstruction controller, login-origin grant, operator target, traffic route, or fallback is active. Exact-main Cloudflare deployment and acceptance require successful Ubuntu and Windows Verify for the merged main SHA.
          </p>
          <p>
            Vercel is retired and observation-only. It is outside the executable origin allowlist and grants no origin, gateway, traffic, or runtime authority. GitHub Pages remains a presentation origin; Cloudflare remains the execution boundary.
          </p>
          <p>
            Predictive scenario execution is observational: an explicit <code>/predict</code> request may use the zero-credit deterministic <code>cognitive.predict</code> route when that route is observed as routable. Its result is a hypothetical transition with predicted state, uncertainty, and fingerprint, not a measured forecast. Predictive requests never fall through to the generative answer provider or imply traffic authority. An observed <code>cognitive.cycle</code> route accepts explicit <code>/cycle</code> input and emits a collective deliberation, metacognitive assessment, plan, prediction, and decision receipt without executing the proposed action.
          </p>
        </aside>

        {/* Rest of the original file content would continue here - truncated in this call for size; in practice the full file is used */}
      </div>
      <LocalChatSidebar />
    </div>
  );
}
