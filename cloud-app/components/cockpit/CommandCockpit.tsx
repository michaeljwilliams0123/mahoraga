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
import { AstSandbox } from "./AstSandbox";
import { LocalChatSidebar } from "./LocalChatSidebar";
import { TelemetrySparkline } from "./TelemetrySparkline";

const HELPERS = [
  { label: "Inspect live repository", command: "Inspect the live Mahoraga repository: health, open issues, and current head." },
  { label: "Audit connection posture", command: "Audit bounded owner-authenticated tunnel posture. Deny unauthenticated or generic public loopback exposure. Report relay and GitHub surfaces." },
  { label: "Build ledger", command: "Show Mahoraga build provenance, Windows compatibility runtime 3.6.0, and this operator deck. No lane or port selection is required." },
  { label: "List arsenal", command: "List the command arsenal and show what this deck can run live versus GitHub, loopback, or deny." },
  { label: "Artifact bridge", command: "Describe the Track 3 bounded artifact bridge (#505): same-origin owner-authenticated upload, loopback /api/artifacts, fail-closed legacy relay. Do not select destination, provider, executable, or paid fallback." },
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
      summary: "Railway exact-SHA cloud health is observational only — no fake rollback API.",
      lines: [
        { label: "product", value: health?.product ?? "unknown" },
        { label: "authority", value: health?.authority ?? "unknown" },
        { label: "paidFallback", value: String(health?.automaticPaidFallback ?? false) },
        { label: "executionPlane", value: health?.executionPlane ?? "unknown" },
        { label: "ownerLoginCache", value: "Cache-Control: no-store (#486)" },
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
      : "Core not paired — Cockpit stays fail-closed for mutations.",
    lines: [
      { label: "core", value: coreReady ? "paired" : "unpaired" },
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

  const healthCard = useMemo(() => {
    if (!healthJson) return null;
    const mapped = mapHealthRoute(healthJson);
    return mapped.ok ? mapped.value : null;
  }, [healthJson]);

  const liveOk = Boolean(healthCard?.ok) && !healthError;
  const readyOk = coreReady && liveOk;

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
            <span className={`cockpit-pill ${healthCard?.ok ? "ok" : healthError ? "danger" : "steel"}`}>
              {healthError ? "HEALTH_ERROR" : healthCard?.ok ? "HEALTH_OK" : "HEALTH_PENDING"}
            </span>
            <span className="cockpit-pill ok">CONVERGED_#460</span>
            <span className="cockpit-pill steel">TEAMS_ATTENDED_OBS</span>
            <span className="cockpit-pill ok">AUTH_NO_STORE_#486</span>
            <span className="cockpit-pill ok">ARTIFACT_BRIDGE_#505</span>
          </div>
        </header>

        <aside className="cockpit-panel tone-ok" aria-label="Convergence status">
          <h3>CONVERGENCE</h3>
          <p>
            Mahoraga cloud cockpit. Build provenance is 7.0.0-alpha.2. PowerShell <code>$PID</code> collision fixed via <code>$ProcessId</code> (#460 / #388).
            Owner login failures use <code>Cache-Control: no-store</code> (#486). Bounded artifact bridge live (#505). Brain-routed; no lane or port selection required for talk/build/handoff/create/report/ship. Windows production stays 3.6.0.
          </p>
          <p>
            Live is /api/live health. Ready is /api/ready after shared core bearer injection by the parent supervisor only when the configured token is blank. Bearer value is never shown, logged, or persisted here.
          </p>
          <dl>
            <div><dt>build provenance</dt><dd>7.0.0-alpha.2</dd></div>
            <div><dt>authoritative runtime</dt><dd>Mahoraga core (4782)</dd></div>
            <div><dt>surface</dt><dd>PR 461 / PR 543</dd></div>
            <div><dt>runtime fix</dt><dd>PR 460 ProcessId</dd></div>
            <div><dt>shared bearer</dt><dd>parent supervisor injects a shared core bearer only when the configured token is blank (#542)</dd></div>
            <div><dt>owner login</dt><dd>PR 486 no-store</dd></div>
            <div><dt>artifact bridge</dt><dd>PR 505 same-origin owner-authenticated upload, loopback /api/artifacts, fail-closed legacy relay</dd></div>
            <div><dt>windows runtime</dt><dd>3.6.0 locked</dd></div>
          </dl>
        </aside>

        <aside className="cockpit-panel tone-neutral" aria-label="Attended Teams send status">
          <h3>ATTENDED TEAMS SEND</h3>
          <p>
            Observational status only (#539 / #376 / #541). communication.send is recipient-bound, one visible ms-teams window, ValuePattern draft plus InvokePattern send, success-only canary. No Graph, SendKeys, or discovery. No browser send action on this surface.
          </p>
          <dl>
            <div><dt>surface</dt><dd>status / convergence copy</dd></div>
            <div><dt>binding</dt><dd>owner-designated recipient</dd></div>
            <div><dt>canary</dt><dd>attended Windows, independent chat confirmation</dd></div>
            <div><dt>cloud UI</dt><dd>no send button, no Graph, no SendKeys</dd></div>
          </dl>
        </aside>

        <nav className="cockpit-tabs" aria-label="Cockpit panels">
          {COCKPIT_PANEL_IDS.map((id) => (
            <button key={id} type="button" className={tab === id ? "active" : undefined} onClick={() => setTab(id)}>{panels[id].title}</button>
          ))}
        </nav>

        <div className="cockpit-grid">
          <section className={`cockpit-panel tone-${active.tone}`} aria-label={`${active.title} panel`}>
            <h3>{active.title}</h3><p>{active.summary}</p>
            <dl>{active.lines.map((line) => (<div key={line.label}><dt>{line.label}</dt><dd>{line.value}</dd></div>))}</dl>
            <div className="cockpit-actions">
              {!coreReady && (<button type="button" onClick={onRequestPairing}>Pair runtime</button>)}
              <button type="button" className="secondary" onClick={onOpenOperations}>Core mutations → Operations</button>
            </div>
          </section>

          <section className="cockpit-gateways" aria-label="Integration gateways">
            <article><header><strong>Railway exact-SHA</strong><span className={`cockpit-pill ${healthCard?.ok ? "ok" : "steel"}`}>{healthCard?.ok ? "OBSERVED" : "IDLE"}</span></header><p>Canonical deployment health is observational only. Fake rollback APIs are hard-denied.</p><p className="cockpit-muted">{HARD_DENIES.fakeRollbackApi}</p></article>
            <article><header><strong>Workspace Gateway</strong><span className="cockpit-pill warn">FAIL_CLOSED</span></header><p>Google OAuth on this console is hard-denied. Task ingest stays off this surface.</p><p className="cockpit-muted">{HARD_DENIES.googleOAuthOnConsole}</p></article>
            <article><header><strong>Owner login</strong><span className="cockpit-pill ok">NO_STORE_#486</span></header><p>Owner login failure and success responses are not cached (<code>Cache-Control: no-store</code>).</p></article>
            <article><header><strong>Bounded Artifact Bridge</strong><span className="cockpit-pill ok">LIVE_#505</span></header><p>Same-origin owner session + CSRF/replay. <code>MAX_FILE_BYTES</code> on received bytes, not Content-Length. Attachment IDs only via authenticated cloud session. Primary Codex token remains server-only. No caller-selected destination, provider, executable, or paid fallback.</p><p className="cockpit-muted">Validated artifacts relay to loopback <code>/api/artifacts</code>. Legacy relay stays fail-closed.</p></article>
            <article><header><strong>Shared core bearer</strong><span className={`cockpit-pill ${readyOk ? "ok" : "steel"}`}>{readyOk ? "READY_ONLINE" : "INJECT_IF_BLANK"}</span></header><p>Parent supervisor injects a shared core bearer only when the configured token is blank. This UI never displays the bearer.</p></article>
            <article><header><strong>Attended Teams</strong><span className="cockpit-pill steel">OBS_ONLY</span></header><p>Recipient-bound attended canary semantics. Cloud cockpit does not send.</p></article>
          </section>
        </div>

        <TelemetrySparkline />

        <section className="cockpit-helpers" aria-label="Automation helpers">
          <h3>Automation helpers</h3>
          <p className="cockpit-muted">Copy-only starters. Browser GitHub write authority is hard-denied — use paired-core Operations.</p>
          <div className="cockpit-helper-grid">{HELPERS.map((helper) => (<button key={helper.label} type="button" onClick={() => void copyHelper(helper.command)}><strong>{helper.label}</strong><span>{helper.command}</span></button>))}</div>
          {copied && <p className="cockpit-muted">Clipboard: {copied === "copy-failed" ? "copy failed" : "helper command copied"}</p>}
          <ul className="cockpit-denies">
            <li>{HARD_DENIES.browserFleetAuthority}</li>
            <li>{HARD_DENIES.unsafeTunnelExposure}</li>
            <li>{HARD_DENIES.nextPublicLoopback}</li>
          </ul>
        </section>

        <AstSandbox code={code} onChange={setCode} />
      </div>
      <LocalChatSidebar />
    </div>
  );
}
