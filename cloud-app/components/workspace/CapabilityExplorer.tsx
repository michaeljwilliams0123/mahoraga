"use client";

import { useState } from "react";
import { projectCapabilityExplorer } from "@/lib/capability-families";
import type { RuntimeCapability } from "@/lib/runtime-relay";

export function CapabilityExplorer({ coreReady, capabilities, onChooseStarter }: {
  coreReady: boolean;
  capabilities: readonly RuntimeCapability[];
  onChooseStarter: (prompt: string) => void;
}) {
  const [query, setQuery] = useState("");
  const rows = projectCapabilityExplorer(coreReady, capabilities);
  const visible = rows.filter(row => `${row.capability} ${row.reason ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <details className="capability-explorer">
      <summary>Explore capabilities · {coreReady ? rows.length : "connect to inspect"}</summary>
      <p>Explore the connected runtime’s reported routes. A routable capability still checks permission and readiness when requested. Starters fill the composer for you to review; they do not execute work.</p>
      <label>Find a capability <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Prediction, repository, memory…" /></label>
      {!coreReady && <p role="status">Connect to the runtime to inspect current capabilities.</p>}
      {coreReady && rows.length === 0 && <p role="status">The runtime has not reported any capabilities.</p>}
      {rows.length > 0 && visible.length === 0 && <p role="status">No matching capabilities.</p>}
      <div className="capability-explorer-list">
        {visible.map((row, index) => (
          <article key={`${row.capability}-${index}`}>
            <strong>{row.capability}</strong>
            <span>{row.state === "routable" ? "Routable" : row.state === "core-only" ? "Outside zero-credit chat" : row.state === "unobserved" ? "Not observed" : "Unavailable"}</span>
            {row.reason && <p>Reason: {row.reason}</p>}
            <p>Workers: {row.workers.join(", ") || "not observed"} · Cost: {row.costClass} · Evidence: {row.evidence}</p>
            {row.lastVerifiedAt && <p>Last verified: {row.lastVerifiedAt}</p>}
            {row.starter && <button type="button" onClick={() => onChooseStarter(row.starter!)}>{row.capability === "cognitive.predict" ? "Try prediction" : "Try planning"}</button>}
          </article>
        ))}
      </div>
    </details>
  );
}
