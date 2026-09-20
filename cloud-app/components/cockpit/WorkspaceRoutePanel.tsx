"use client";

import type { Health } from "../workspace/workspace-types";

const POLICY_CATALOG = [
  { id: "destiny-workspace", order: "Destiny only", note: "fails closed until Destiny receipt identity agrees" },
  { id: "mike-primary", order: "Mike only", note: "metered only when MIKE_PRIMARY_METERED=true" },
  { id: "balanced", order: "Destiny then Mike", note: "default owner policy" },
  { id: "overflow", order: "Mike then Destiny", note: "spill after Mike budget" },
] as const;

type Props = {
  health: Health | null;
};

export function WorkspaceRoutePanel({ health }: Props) {
  const routing = health?.routing;
  const authority = routing?.authority ?? "unverified";
  const paidFallback = routing?.automaticPaidFallback === true;
  const browserSelect = routing?.browserMaySelectProvider === true;
  const evidenceReady = Boolean(routing?.authority);

  return (
    <section className="eclipse-panel" aria-labelledby="workspace-route-heading">
      <div className="eclipse-panel-heading">
        <div>
          <span>7.0.0-alpha.2 dispatch</span>
          <h3 id="workspace-route-heading">Metered multi-workspace routing</h3>
        </div>
      </div>
      <p>
        Cloud cockpit catalog for Mike↔Destiny lanes from #623. Active policy is shown only from paired health evidence.
        Browser does not mutate dispatch. Windows 3.6.0 stays untouched.
      </p>
      <dl className="eclipse-metrics">
        <div><dt>Routing authority</dt><dd>{authority}</dd></div>
        <div><dt>Paid fallback</dt><dd>{paidFallback ? "enabled" : "disabled"}</dd></div>
        <div><dt>Browser provider select</dt><dd>{browserSelect ? "allowed" : "blocked"}</dd></div>
        <div><dt>Evidence</dt><dd>{evidenceReady ? "health.routing present" : "awaiting paired core receipts"}</dd></div>
      </dl>
      <ul className="eclipse-flow">
        {POLICY_CATALOG.map((policy) => (
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
