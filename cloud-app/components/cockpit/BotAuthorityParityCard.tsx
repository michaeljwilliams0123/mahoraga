export function BotAuthorityParityCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="bot-authority-parity">
      <span>Bot authority parity</span>
      <strong>Observational · fail-closed</strong>
      <p>
        Merged #965 (344757b) inherits the mahoraga-core owner grant for child-bot operational actions and requires the same owner/platform/capability intersection. Drift on objective, authority, source, trust epoch, evaluator, cost, audience, or security fails closed. Stale or future evidence is rejected. Ownership transfer, owner recovery removal, destruction of all rollback generations, and root-credential transfer stay non-delegable. No bot-equals-owner shortcut, no spend or credential expansion, no Railway or traffic-authority change. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only.
      </p>
    </article>
  );
}
