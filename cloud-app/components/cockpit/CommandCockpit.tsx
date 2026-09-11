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
  { label: "Audit connection posture", command: "Audit outbound-only connection posture. Deny inbound tunnels. Report relay and GitHub surfaces." },
  { label: "Version ledger", command: "Show the version ledger: live 3.6.0, candidate 7.0.0-alpha.2, and this operator deck." },
  { label: "List arsenal", command: "List the command arsenal and show what this deck can run live versus GitHub, loopback, or deny." },
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
      summary: "Vercel cloud-app health is observational only — no fake rollback API.",
      lines: [
        { label: "product", value: health?.product ?? "unknown" },
        { label: "authority", value: health?.authority ?? "unknown" },
        { label: "paidFallback", value: String(health?.automaticPaidFallback ?? false) },
        { label: "executionPlane", value: health?.executionPlane ?? "unknown" },
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
            <span className="cockpit-eyebrow">Mahoraga pressure-test</span>
            <h2>INTEGRATED_COCKPIT</h2>
          </div>
          <div className="cockpit-header-meta">
            <span className={`cockpit-pill ${coreReady ? "ok" : "warn"}`}>{coreReady ? "CORE_PAIRED" : "CORE_UNPAIRED"}</span>
            <span className={`cockpit-pill ${healthCard?.ok ? "ok" : healthError ? "danger" : "steel"}`}>
              {healthError ? "HEALTH_ERROR" : healthCard?.ok ? "HEALTH_OK" : "HEALTH_PENDING"}
            </span>
          </div>
        </header>

        <nav className="cockpit-tabs" aria-label="Cockpit panels">
          {COCKPIT_PANEL_IDS.map((id) => (
            <button key={id} type="button" className={tab === id ? "active" : undefined} onClick={() => setTab(id)}>
              {panels[id].title}
            </button>
          ))}
        </nav>

        <div className="cockpit-grid">
          <section className={`cockpit-panel tone-${active.tone}`} aria-label={`${active.title} panel`}>
            <h3>{active.title}</h3>
            <p>{active.summary}</p>
            <dl>
              {active.lines.map((line) => (
                <div key={line.label}>
                  <dt>{line.label}</dt>
                  <dd>{line.value}</dd>
                </div>
              ))}
            </dl>
            <div className="cockpit-actions">
              {!coreReady && (
                <button type="button" onClick={onRequestPairing}>
                  Pair runtime
                </button>
              )}
              <button type="button" className="secondary" onClick={onOpenOperations}>
                Core mutations → Operations
              </button>
            </div>
          </section>

          <section className="cockpit-gateways" aria-label="Integration gateways">
            <article>
              <header>
                <strong>Vercel Edge</strong>
                <span className={`cockpit-pill ${healthCard?.ok ? "ok" : "steel"}`}>{healthCard?.ok ? "OBSERVED" : "IDLE"}</span>
              </header>
              <p>Observational health only. Fake rollback APIs are hard-denied.</p>
              <p className="cockpit-muted">{HARD_DENIES.fakeRollbackApi}</p>
            </article>
            <article>
              <header>
                <strong>Workspace Gateway</strong>
                <span className="cockpit-pill warn">FAIL_CLOSED</span>
              </header>
              <p>Google OAuth on this console is hard-denied. Task ingest stays off this surface.</p>
              <p className="cockpit-muted">{HARD_DENIES.googleOAuthOnConsole}</p>
            </article>
          </section>
        </div>

        <TelemetrySparkline />

        <section className="cockpit-helpers" aria-label="Automation helpers">
          <h3>Automation helpers</h3>
          <p className="cockpit-muted">Copy-only starters. Browser GitHub write authority is hard-denied — use paired-core Operations.</p>
          <div className="cockpit-helper-grid">
            {HELPERS.map((helper) => (
              <button key={helper.label} type="button" onClick={() => void copyHelper(helper.command)}>
                <strong>{helper.label}</strong>
                <span>{helper.command}</span>
              </button>
            ))}
          </div>
          {copied && <p className="cockpit-muted">Clipboard: {copied === "copy-failed" ? "copy failed" : "helper command copied"}</p>}
          <ul className="cockpit-denies">
            <li>{HARD_DENIES.browserFleetAuthority}</li>
            <li>{HARD_DENIES.inboundTunnels}</li>
            <li>{HARD_DENIES.nextPublicLoopback}</li>
          </ul>
        </section>

        <AstSandbox code={code} onChange={setCode} />
      </div>
      <LocalChatSidebar />
    </div>
  );
}
