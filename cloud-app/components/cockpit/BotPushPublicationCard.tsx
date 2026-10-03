export function BotPushPublicationCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="bot-push-publication">
      <span>Bot publication rule</span>
      <strong>Eligible only · observational</strong>
      <p>
        A bot-triggered lifecycle handoff is eligible only when canonical Verify Mahoraga succeeds on protected main and the exact repository, workflow path, push event, main branch, source SHA, and github-actions[bot] actor checks all match. Owner/manual pushes remain separately governed. Publication evidence does not grant traffic authority, runtime readiness, or production cutover; Cloudflare acceptance remains receipt-bound. Railway remains zero-route, zero-influence, zero-fallback, and zero-authority.
      </p>
    </article>
  );
}
