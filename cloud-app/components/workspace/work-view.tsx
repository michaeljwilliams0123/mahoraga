import { Activity, CircleAlert, GitBranch, LoaderCircle, RefreshCw, ShieldCheck, Sparkles, WandSparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { RuntimeOperationsSnapshot } from "@/lib/runtime-relay";
import type { WorkViewProps } from "./workspace-types";

export function WorkView({ coreReady, relay, onRequestPairing, onRunQuickAction }: WorkViewProps) {
  const [snapshot, setSnapshot] = useState<RuntimeOperationsSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!coreReady || !relay?.connected) {
      setSnapshot(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await relay.operationsSnapshot());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "work-status-unavailable");
    } finally {
      setLoading(false);
    }
  }, [coreReady, relay]);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <section className="one-view" aria-label="Work">
      <div className="one-view-heading">
        <div>
          <span className="one-kicker">Live work</span>
          <h1>What Mahoraga is doing</h1>
          <p>Human-readable progress from the paired brain. Technical routing stays in Advanced.</p>
        </div>
        <button className="icon-button" type="button" onClick={() => void refresh()} disabled={loading} aria-label="Refresh work status">
          {loading ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}
        </button>
      </div>

      {!coreReady ? (
        <div className="one-empty-card">
          <ShieldCheck size={24} />
          <div><strong>Connect Mahoraga to see live work.</strong><p>The browser stays a thin client; the paired core owns execution.</p></div>
          <button type="button" onClick={onRequestPairing}>Connect</button>
        </div>
      ) : error ? (
        <div className="one-alert"><CircleAlert size={17} /> {error}</div>
      ) : (
        <div className="work-grid">
          <article><Activity size={20} /><span>Active</span><strong>{snapshot?.tasks.active ?? 0}</strong><small>tasks in motion</small></article>
          <article><Sparkles size={20} /><span>Waiting</span><strong>{snapshot?.tasks.waiting ?? 0}</strong><small>needs time or input</small></article>
          <article><GitBranch size={20} /><span>Repository</span><strong>{snapshot?.repository.cleanState ?? "checking"}</strong><small>{snapshot?.repository.headSha?.slice(0, 8) ?? "head unavailable"}</small></article>
          <article><WandSparkles size={20} /><span>Repairs</span><strong>{snapshot?.repairs.activeIncidents ?? 0}</strong><small>{snapshot?.repairs.lastRepairState ?? "checking"}</small></article>
        </div>
      )}

      <div className="one-action-row" aria-label="Work actions">
        <button type="button" onClick={() => void onRunQuickAction("build")} disabled={!coreReady}>Build</button>
        <button type="button" onClick={() => void onRunQuickAction("report")} disabled={!coreReady}>Report</button>
        <button type="button" className="primary" onClick={() => void onRunQuickAction("ship")} disabled={!coreReady}>Ship update</button>
      </div>
    </section>
  );
}
