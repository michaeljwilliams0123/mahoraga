import { summarizeDissentGate, type CollectiveDissentReceipt } from "@/lib/dissent-receipt";

export function DissentReceiptPanel({ receipt }: { receipt?: CollectiveDissentReceipt | null }) {
  const gate = summarizeDissentGate(receipt ?? null);
  const support = receipt?.alternativeSupport;
  const qualified =
    Boolean(support?.qualified) &&
    (support?.currentParticipantCount ?? 0) >= 2 &&
    (support?.currentIndependentLineageCount ?? 0) >= 2;

  return (
    <section className="eclipse-panel" aria-label="Evidence-qualified Collective dissent">
      <div className="eclipse-panel-heading">
        <div>
          <span>Collective receipt</span>
          <h3>Evidence-qualified dissent</h3>
        </div>
        <span className={`cockpit-pill ${gate.tone === "warn" ? "warn" : gate.tone === "good" ? "ok" : "steel"}`}>
          {gate.label}
        </span>
      </div>
      <p>{gate.detail}. Raw Collective dissent stays visible. Planner/router authority is unchanged.</p>
      <dl className="eclipse-metrics">
        <div><dt>blocking</dt><dd>{receipt?.blockingCount ?? 0}</dd></div>
        <div><dt>nonblocking</dt><dd>{receipt?.preservedNonBlockingCount ?? 0}</dd></div>
        <div><dt>dissent-escalation</dt><dd>{receipt?.escalationCount ?? 0} after 3 unresolved cycles</dd></div>
        <div><dt>fail-closed re-observe</dt><dd>{receipt?.items?.some((item) => item.observation?.nextAction === "reobserve") ? "required when evidence missing/aging" : "not required"}</dd></div>
        <div><dt>qualified alternative</dt><dd>{qualified ? `${support?.conclusion ?? "ranked"} · ${support?.currentParticipantCount} participants · ${support?.currentIndependentLineageCount} lineage roots` : "needs 2 participants + 2 current independent lineage roots"}</dd></div>
      </dl>
      {receipt?.items?.map((item) => (
        <article key={item.individualId} className="eclipse-status-card">
          <span>{item.individualId}</span>
          <strong>{item.blocking ? (item.escalation ? "blocking · dissent-escalation" : "blocking") : "nonblocking"}</strong>
          <p>
            {item.reasonCode} · cycles {item.unresolvedCycles} · next {item.observation?.nextAction ?? "none"}
            {item.dissentTags?.length ? ` · tags ${item.dissentTags.join(",")}` : ""}
          </p>
        </article>
      ))}
      {receipt?.rawCollectiveDissent != null && (
        <pre aria-label="Raw Collective dissent">{JSON.stringify(receipt.rawCollectiveDissent, null, 2)}</pre>
      )}
    </section>
  );
}
