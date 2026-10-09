"use client";

import { Link2, ShieldCheck, Unplug } from "lucide-react";
import { useState } from "react";
import type { RuntimeCapability, RuntimeCloudInspectionReceipt, RuntimeGithubAppRepositoryProbe } from "@/lib/runtime-relay";
import type { ConnectionsViewProps } from "./workspace-types";
import { projectCapabilityFamilies } from "@/lib/capability-families";
import { isFreshCloudInspectorCapability } from "@/lib/cloud-inspect-receipt";

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
  const [githubProbe, setGithubProbe] = useState<RuntimeGithubAppRepositoryProbe | null>(null);
  const [githubBusy, setGithubBusy] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [cloudReceipt, setCloudReceipt] = useState<RuntimeCloudInspectionReceipt | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const eligibleCloudInspector = () => displayCapabilities.some(item => isFreshCloudInspectorCapability(item));
  const cloudInspectReady = coreReady && relay?.connected === true && relay.transportKind !== "encrypted-relay"
    && eligibleCloudInspector();

  async function probeGithubApp() {
    if (!relay || githubBusy) return;
    setGithubBusy(true);
    setGithubError(null);
    try {
      setGithubProbe(await relay.nativeGithubRepository());
    } catch (error) {
      setGithubProbe(null);
      setGithubError(error instanceof Error ? error.message : "github-native-probe-failed");
    } finally {
      setGithubBusy(false);
    }
  }

  async function inspectCloudflare() {
    // An advertised capability can expire between rendering and a click.
    if (!relay || cloudBusy || !cloudInspectReady || !eligibleCloudInspector()) return;
    setCloudBusy(true);
    setCloudReceipt(null);
    setCloudError(null);
    try { setCloudReceipt(await relay.inspectCloudflareDeployment()); }
    catch (error) { setCloudError(error instanceof Error ? error.message : "cloud-inspection-unavailable"); }
    finally { setCloudBusy(false); }
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
      <p className="muted">Route status is observed when the runtime pairs. Execution rechecks authority and provider readiness for each request.</p>

      <div className="capability-list" aria-label="Agentic, generative, and predictive readiness">
        {projectCapabilityFamilies(coreReady, runtimeCapabilities).map((family) => (
          <div key={family.id}>
            <strong>{family.label}</strong>
            <span>{family.state === "routable" ? `Routable · ${family.route} · ${family.evidence}` : family.state === "core-only" ? `Core route · ${family.route} · outside zero-credit chat; separate authority and spend approval required` : family.state === "unobserved" ? "Not observed · pair runtime to inspect" : `Unavailable · ${family.route ?? "no route reported"} · ${family.reason}`}{family.id === "agentic" && family.route === "cognitive.cycle" ? " · collective decision receipt only; no proposed action is executed" : family.id === "predictive" ? " · prediction→outcome→calibration→institutional learning→planner feedback is canonical; live metrics remain receipt-gated" : ""}</span>
          </div>
        ))}
        <div><strong>Collective advantage</strong><span>Not measured · requires held-out benchmark receipts against the strongest individual route</span></div>
      </div>

      <div className="capability-list" style={{ marginTop: 16 }}>
        <div>
          <strong>Runtime connection</strong>
          <span>{coreReady ? relay?.transportKind === "pages-owner-bridge" ? "connected · authenticated Pages bridge" : relay?.transportKind === "same-origin-cloud" ? "connected · authenticated cloud session" : "connected · encrypted WebSocket relay" : "disconnected"}</span>
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
            <strong>Native GitHub App</strong>
            <span>
              {githubProbe?.repository.fullName
                ? `verified · ${githubProbe.repository.fullName} · ${githubProbe.repository.defaultBranch ?? "unknown branch"}`
                : githubError
                  ? `not ready · ${githubError}`
                  : "bounded read probe available"}
            </span>
          </div>
          {githubProbe && (
            <div>
              <strong>GitHub App authority</strong>
              <span>{githubProbe.repository.permissions.push ? "Repository-scoped write authority observed; probe remains read-only" : "Repository-scoped read authority observed"}</span>
            </div>
          )}
        </div>
      )}

      {cloudInspectReady && (
        <div className="capability-list" style={{ marginTop: 16 }}>
          <div>
            <strong>Live Cloudflare action</strong>
            <span>{cloudReceipt
              ? `Verified read · ${cloudReceipt.script} · version ${cloudReceipt.versionId} · ${cloudReceipt.trafficPercentage}% traffic · ${new Date(cloudReceipt.observedAt).toLocaleString()}`
              : cloudError ? `Execution unavailable · ${cloudError}` : "Read-only deployment inspection; execution requires a fresh broker lease and receipt."}</span>
          </div>
          <button type="button" disabled={cloudBusy} onClick={() => void inspectCloudflare()}>
            {cloudBusy ? "Inspecting live Cloudflare…" : "Inspect Cloudflare"}
          </button>
        </div>
      )}

      <div className="pairing-actions" style={{ marginTop: 16 }}>
        {coreReady && (
          <button type="button" disabled={githubBusy || !relay} onClick={() => void probeGithubApp()}>
            <Link2 size={16} /> {githubBusy ? "Probing GitHub App…" : "Probe native GitHub App"}
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
