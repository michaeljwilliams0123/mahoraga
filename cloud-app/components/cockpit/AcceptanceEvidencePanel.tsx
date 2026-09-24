"use client";

import { ShieldCheck } from "lucide-react";

export type AcceptanceEvidencePanelProps = {
  cognitionObserved: boolean;
  cognitionDetail: string;
  noRailwayVerified: boolean;
  noRailwayDetail: string;
  bypassApplied: boolean;
  providerId: string;
  sha: string;
  durableState: string;
};

export function AcceptanceEvidencePanel({
  cognitionObserved,
  cognitionDetail,
  noRailwayVerified,
  noRailwayDetail,
  bypassApplied,
  providerId,
  sha,
  durableState,
}: AcceptanceEvidencePanelProps) {
  const admission = bypassApplied
    ? "fail-closed (x-bypass-applied)"
    : cognitionObserved
      ? "admitted via sanitized receipt"
      : "not admitted";

  return (
    <section className="eclipse-panel" aria-labelledby="acceptance-evidence-heading">
      <div className="eclipse-panel-heading">
        <div>
          <span>Cloudflare acceptance evidence</span>
          <h3 id="acceptance-evidence-heading">Operator evidence (observational)</h3>
        </div>
        <ShieldCheck size={18} />
      </div>
      <dl className="eclipse-metrics">
        <div><dt>Cloudflare cognition</dt><dd>{cognitionObserved ? "Observed" : "Unverified"} · {cognitionDetail}</dd></div>
        <div><dt>Required-secret / provider admission</dt><dd>{admission} · {providerId} · bearer never shown</dd></div>
        <div><dt>No Railway fallback</dt><dd>{noRailwayVerified ? "Verified" : "Unproven"} · {noRailwayDetail}</dd></div>
        <div><dt>SHA / durableState</dt><dd>SHA {sha} · durableState {durableState} · /api/ready observational only</dd></div>
        <div><dt>Traffic authority</dt><dd>Separate / unverified · unpromoted claim · never inferred from /api/ready or cloudflare-execution-runtime hop identity</dd></div>
      </dl>
    </section>
  );
}
