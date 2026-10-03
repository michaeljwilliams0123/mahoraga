export function BotPushPublicationCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="bot-push-publication">
      <span>Bot publication rule</span>
      <strong>Receipt-bound · observational</strong>
      <p>
        github-actions[bot] is a token identity, not a unique caller. A bot push remains eligible only when canonical Verify Mahoraga succeeds on protected main and the exact repository, workflow path, push event, main branch, source SHA, and actor checks match. Bot workflow-dispatch publication is not eligible from actor or event checks alone. Owner-triggered publication stays separately governed. Publication evidence does not grant traffic authority, runtime readiness, or production cutover. Cloudflare acceptance remains receipt-bound. Railway remains zero-route, zero-influence, zero-fallback, and zero-authority.
      </p>
    </article>
  );
}
