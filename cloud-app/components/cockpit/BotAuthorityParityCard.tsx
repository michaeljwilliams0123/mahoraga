export function BotAuthorityParityCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="bot-authority-parity">
      <span>Bot operational parity</span>
      <strong>Drift-guarded / not live</strong>
      <p>
        Observational contract for issue #962. Bot identity alone never grants power. Operational parity requires a fresh exact-source objective-bound grant plus platform and capability support, independent postcondition verification, and matching objective, authority, source SHA, trust epoch, evaluator, cost, audience, and security bindings. Material drift is HOLD (bot-authority-drift), not silent continuation. Owner-root actions stay non-delegable: ownership transfer, owner-recovery removal, destroy-all rollback generations, and root-credential transfer. No blanket bot == owner shortcut. Closed #964 is not live authority. Railway remains zero-route, zero-influence, zero-fallback, zero-authority. This card does not grant traffic authority.
      </p>
    </article>
  );
}
