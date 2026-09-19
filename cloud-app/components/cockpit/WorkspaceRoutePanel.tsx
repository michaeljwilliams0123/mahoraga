"use client";

const POLICIES = [
  { id: "destiny-workspace", order: "Destiny only", note: "fails closed until Destiny receipt identity agrees" },
  { id: "mike-primary", order: "Mike only", note: "metered only when MIKE_PRIMARY_METERED=true" },
  { id: "balanced", order: "Destiny then Mike", note: "default owner policy" },
  { id: "overflow", order: "Mike then Destiny", note: "spill after Mike budget" },
] as const;

export function WorkspaceRoutePanel() {
  return (
    <section className="eclipse-panel" aria-labelledby="workspace-route-heading">
      <div className="eclipse-panel-heading">
        <div>
          <span>7.0.0-alpha.2 dispatch</span>
          <h3 id="workspace-route-heading">Metered multi-workspace routing</h3>
        </div>
      </div>
      <p>Cloud-only Mike↔Destiny lane from merged #623. Connector bot is transport evidence only. Windows 3.6.0 stays untouched.</p>
      <ul className="eclipse-flow">
        {POLICIES.map((policy) => (
          <li key={policy.id}>
            <div>
              <strong><code>{policy.id}</code></strong>
              <small>{policy.order} · {policy.note}</small>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
