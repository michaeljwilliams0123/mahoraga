"use client";

import { useEffect, useState } from "react";
import { loadGithubWorkspace, type GithubWorkspaceLoad, type GithubWorkspaceTransport } from "@/lib/github-workspace";

const OWNER_WORKSPACE_URL = "https://mahoraga-owner-gateway.mahoraga-mjw0123.workers.dev/";
const PAGES_MIRROR_URL = "https://michaeljwilliams0123.github.io/mahoraga/";

export function GithubWorkspacePanel({ coreReady, relay, publishedCommit }: {
  coreReady: boolean;
  relay: GithubWorkspaceTransport | null;
  publishedCommit?: string | null;
}) {
  const [state, setState] = useState<GithubWorkspaceLoad | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!coreReady || !relay) { setState(null); return; }
    return loadGithubWorkspace(relay, setState);
  }, [coreReady, relay, refresh]);
  return <GithubWorkspaceView coreReady={coreReady} state={state} publishedCommit={publishedCommit} canRefresh={Boolean(relay)} onRefresh={() => setRefresh(value => value + 1)} />;
}

export function GithubWorkspaceView({ coreReady, state, publishedCommit, canRefresh, onRefresh }: {
  coreReady: boolean; state: GithubWorkspaceLoad | null; publishedCommit?: string | null; canRefresh: boolean; onRefresh: () => void;
}) {
  const snapshot = coreReady && state?.phase === "ready" ? state.snapshot : null;
  const error = coreReady && state?.phase === "error" ? state.reason : null;
  return (
    <details className="github-workspace-panel">
      <summary>GitHub status · Pages + Actions (read-only)</summary>
      <div className="github-workspace-heading">
        <p>Once the owner runtime is paired, Mahoraga reads Pages and Actions through its native GitHub App. This inspection does not authorize repository writes, merges or cloud execution.</p>
        <button type="button" onClick={onRefresh} disabled={!coreReady || !canRefresh || state?.phase === "loading"}>Refresh GitHub status</button>
      </div>
      {!coreReady && <p role="status">The UI is available. Pair the authenticated owner runtime to inspect Pages and Actions through the native GitHub App.</p>}
      {coreReady && state?.phase === "loading" && <p role="status">Checking GitHub Pages and Actions…</p>}
      {error && <p role="alert">GitHub workspace unavailable · {error}. The connected runtime must support native GitHub workspace inspection.</p>}
      <div className="github-workspace-grid">
        <section aria-label="GitHub Pages status">
          <h3>GitHub Pages</h3>
          <a href={OWNER_WORKSPACE_URL} target="_blank" rel="noopener noreferrer">Open owner workspace</a>
          <p><a href={PAGES_MIRROR_URL} target="_blank" rel="noopener noreferrer">Open Pages mirror</a> · presentation/provenance only.</p>
          {publishedCommit && /^[a-f0-9]{40}$/.test(publishedCommit) && <p>Published UI commit: <code>{publishedCommit.slice(0, 12)}</code></p>}
          {snapshot && <>
            <p>{snapshot.pages.state === "available" ? `Site status: ${snapshot.pages.status ?? "not reported"} · ${snapshot.pages.buildType ?? "build type not reported"}` : snapshot.pages.state === "denied" ? "Pages access denied · GitHub App Pages read permission is required." : "Pages status unavailable. A 404 can mean the site is unavailable or access is missing."}</p>
            {snapshot.pages.reason && <p>Reason: {snapshot.pages.reason}</p>}
          </>}
        </section>
        <section aria-label="GitHub Actions status">
          <h3>GitHub Actions</h3>
          <a href="https://github.com/michaeljwilliams0123/mahoraga/actions" target="_blank" rel="noopener noreferrer">Open workflow runs</a>
          {snapshot?.actions.state === "available" && <>
            {snapshot.actions.runs.length === 0 && <p>No recent workflow runs were returned.</p>}
            <ul>{snapshot.actions.runs.map(run => <li key={run.id}>
              <a href={`https://github.com/michaeljwilliams0123/mahoraga/actions/runs/${run.id}`} target="_blank" rel="noopener noreferrer">{run.name}</a>
              <span> · {run.conclusion ?? run.status} · {run.branch ?? "branch not reported"} · {run.sha?.slice(0, 12) ?? "commit not reported"}</span>
            </li>)}</ul>
            {snapshot.actions.failedRunId && <div><h4>Latest returned failed run · #{snapshot.actions.failedRunId}</h4>
              {snapshot.actions.failedJobs.map((job, index) => <p key={`${job.name}-${index}`}>{job.name}{job.steps.length > 0 ? ` · ${job.steps.join(", ")}` : " · no failed-step details returned"}</p>)}
              {snapshot.actions.failureDetailsReason && <p>Failure details unavailable · {snapshot.actions.failureDetailsReason}</p>}
            </div>}
          </>}
          {snapshot && snapshot.actions.state !== "available" && <p>{snapshot.actions.state === "denied" ? "Actions access denied · GitHub App Actions read permission is required." : "Actions status unavailable."} {snapshot.actions.reason}</p>}
        </section>
      </div>
      {snapshot && <p className="muted">Observed {snapshot.observedAt} · michaeljwilliams0123/mahoraga</p>}
    </details>
  );
}
