"use client";

import { useEffect, useMemo, useState } from "react";
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
import { AstSandbox } from "./AstSandbox";
import { DissentReceiptPanel } from "./DissentReceiptPanel";
import { LocalChatSidebar } from "./LocalChatSidebar";
import { TelemetrySparkline } from "./TelemetrySparkline";

const HELPERS = [
  { label: "Inspect live repository", command: "Inspect the live Mahoraga repository: health, open issues, and current head." },
  { label: "Audit connection posture", command: "Audit bounded owner-authenticated tunnel posture. Deny unauthenticated or generic public loopback exposure. Report relay and GitHub surfaces." },
  { label: "Build ledger", command: "Show Mahoraga build provenance, Windows compatibility runtime 3.6.0, and this operator deck. No lane or port selection is required." },
  { label: "List arsenal", command: "List the command arsenal and show what this deck can run live versus GitHub, loopback, or deny." },
  { label: "Artifact bridge", command: "Describe the Track 3 bounded artifact bridge (#505): same-origin owner-authenticated upload, loopback /api/artifacts, fail-closed legacy relay. Do not select destination, provider, executable, or paid fallback." },
  { label: "Workers Builds detect", command: "Describe Cloudflare Workers Builds root wrangler.toml (#562): production npx wrangler deploy and preview npx wrangler versions upload resolve deploy/cloudflare-owner-gateway/worker.mjs from repo root. Nested wrangler.toml remains valid. No Worker logic or secret values changed." },
] as const;

type CommandCockpitProps = {
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
      summary: "GitHub Pages is the published static workspace. Railway exact-SHA health is observational runtime only — no fake rollback API.",
      lines: [
        { label: "product", value: health?.product ?? "unknown" },
        { label: "authority", value: health?.authority ?? "unknown" },
        { label: "paidFallback", value: String(health?.automaticPaidFallback ?? false) },
        { label: "executionPlane", value: health?.executionPlane ?? "unknown" },
        { label: "ownerLoginCache", value: "Cache-Control: no-store (#486)" },
        { label: "workersBuilds", value: "root wrangler.toml → owner gateway (#562)" },
        { label: "ciLane", value: "self-hosted Linux/X64 (publish + steward, informational)" },
        { label: "railwayPromote", value: "after Verify Mahoraga on main; verified run SHA (#656)" },
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
      { label: "presentation", value: "GitHub Pages static workspace" },
      { label: "execution", value: "encrypted relay" },
      { label: "relaySeesPlaintext", value: String(health?.relaySeesPlaintext ?? false) },
      { label: "browserMaySelectProvider", value: String(health?.browserMaySelectProvider ?? false) },
    ],
    actionable: false,
  };
}

export function CommandCockpit({
  coreReady,
  healthJson,
  healthError,
  onRequestPairing,
  onOpenOperations,
}: CommandCockpitProps) {
  const [tab, setTab] = useState<CockpitPanelId>("cloud");
  const [code, setCode] = useState(
    `// Pressure-test AST sandbox (local only)\nexport const optimize = (node: { rewriteLoops: () => unknown }) => {\n  return node.rewriteLoops();\n};\n`,
  );
  const [copied, setCopied] = useState<string | null>(null);
  const [readinessOk, setReadinessOk] = useState(false);

  useEffect(() => {
    let active = true;
    setReadinessOk(false);
    void fetch("/api/ready")
      .then((response) => { if (active) setReadinessOk(response.ok); })
      .catch(() => { if (active) setReadinessOk(false); });
    return () => { active = false; };
  }, [coreReady]);

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

  const liveOk = Boolean(healthCard?.ok) && !healthError;
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
            <span className="cockpit-pill steel">TEAMS_ATTENDED_OBS</span>
            <span className="cockpit-pill ok">AUTH_NO_STORE_#486</span>
            <span className="cockpit-pill ok">ARTIFACT_BRIDGE_#505</span>
            <span className="cockpit-pill ok">ORIGIN_BOUNDARY_#550</span>
            <span className="cockpit-pill ok">WORKERS_BUILDS_#562</span>
            <span className="cockpit-pill steel">CI_LINUX_X64</span>
            <span className="cockpit-pill ok">RAILWAY_PROMOTE_#656</span>
            <span className="cockpit-pill steel">BASELINE_VITEST_#695</span>
          </div>
        </header>

        <aside className="cockpit-panel tone-ok" aria-label="Convergence status">
          <h3>CONVERGENCE</h3>
          <p>
            Mahoraga cloud cockpit. Build provenance is 7.0.0-alpha.2. PowerShell <code>$PID</code> collision fixed via <code>$ProcessId</code> (#460 / #388).
            Owner login failures use <code>Cache-Control: no-store</code> (#486). Bounded artifact bridge live (#505). Brain-routed; no lane or port selection required for talk/build/handoff/create/report/ship. The active Windows runtime is reported from live core status; 3.6.0 is retained only as the legacy rollback predecessor.
          </p>
          <p role="status">
            Published static workspace: GitHub Pages. Execution path: existing encrypted relay to the Conversation Gateway. Railway remains the server-capable runtime during migration. No cross-origin authenticated API calls from github.io.
          </p>
          <p>
            Live is /api/live health. Ready is /api/ready after shared core bearer injection by the parent supervisor only when the configured token is blank. Bearer value is never shown, logged, or persisted here.
          </p>
          <p role="status">
            Ready is live health plus paired core. Pairing is explicit: CORE_UNPAIRED stays fail-closed until Pair runtime succeeds. LIVE_OK alone is not Ready.
          </p>
          <p>
            7.0.0-alpha.2 mutations through the owner gateway are same-origin only. Cross-origin mutations fail closed with <code>403 gateway-same-origin-required</code>; the trusted mutation origin is rewritten to the canonical Railway upstream (#550). github.io is presentation only and must not call authenticated APIs.
          </p>
          <p>
            Cloudflare Workers Builds now detects the owner gateway from repo root via root <code>wrangler.toml</code> pointing at <code>deploy/cloudflare-owner-gateway/worker.mjs</code> (#562). Production <code>npx wrangler deploy</code> and preview <code>npx wrangler versions upload</code> resolve the same live Worker. Nested config remains valid. No Worker logic or secret values changed.
          </p>
          <p>
            CI publish and steward jobs use the self-hosted Linux/X64 lane. Informational copy only. This does not activate 7.0.0-alpha.2 on Windows and does not change cognition or paid fallback.
          </p>
          <p>
            Railway exact-SHA promotion (#656) runs only after a successful owner-authored Verify Mahoraga on main. Checkout and promoter bind to the verified run SHA, not the Railway GitHub status context. Wait for CI stays disabled to avoid a pre-deploy circular dependency. Liveness/readiness provenance probe and rollback remain.
          </p>
          <p>
            Release baseline tracks Vitest 4.1.11 after #695. Observational UI/provenance display for 7.0.0-alpha.2 only; no new mutation authority.
          </p>
          <dl>
            <div><dt>build provenance</dt><dd>7.0.0-alpha.2</dd></div>
            <div><dt>browser presentation</dt><dd>GitHub Pages</dd></div>
            <div><dt>execution path</dt><dd>encrypted relay</dd></div>
            <div><dt>authoritative runtime</dt><dd>Mahoraga core (4782)</dd></div>
            <div><dt>surface</dt><dd>PR 461 / PR 543</dd></div>
            <div><dt>runtime fix</dt><dd>PR 460 ProcessId</dd></div>
            <div><dt>shared bearer</dt><dd>parent supervisor injects a shared core bearer only when the configured token is blank (#542)</dd></div>
            <div><dt>owner login</dt><dd>PR 486 no-store</dd></div>
            <div><dt>artifact bridge</dt><dd>PR 505 same-origin owner-authenticated upload, loopback /api/artifacts, fail-closed legacy relay</dd></div>
            <div><dt>mutation boundary</dt><dd>PR 550 same-origin only; cross-origin mutations fail closed with 403 gateway-same-origin-required</dd></div>
            <div><dt>workers builds detect</dt><dd>PR 562 root wrangler.toml → deploy/cloudflare-owner-gateway/worker.mjs</dd></div>
            <div><dt>ci publish/steward</dt><dd>self-hosted Linux/X64 lane (informational)</dd></div>
            <div><dt>railway promote</dt><dd>PR 656 after Verify Mahoraga on main; verified run SHA; Wait for CI disabled</dd></div>
            <div><dt>release baseline</dt><dd>PR 695 Vitest 4.1.11 (observational)</dd></div>
            <div><dt>active Windows runtime</dt><dd>observed through live core status</dd></div>
            <div><dt>legacy rollback predecessor</dt><dd>3.6.0</dd></div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
