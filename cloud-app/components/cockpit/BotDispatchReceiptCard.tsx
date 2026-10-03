export function BotDispatchReceiptCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="bot-dispatch-receipt">
      <span>Bot dispatch publication</span>
      <strong>Receipt-bound · observational</strong>
      <p>
        github-actions[bot] workflow_dispatch publication is eligible only when a verified-main-publication-v1 artifact is bound to the exact Verify run ID, merged SHA, Autonomous Integration source run, source workflow path .github/workflows/autonomous-integration.yml, and current protected main. Actor identity alone is not authority. Missing, duplicate, expired, malformed, foreign, or stale receipts fail closed. Owner-triggered publication and bot push verification remain separately governed. This card does not claim a live receipt has been observed. Publication evidence does not grant traffic authority, runtime readiness, or production cutover. Railway remains zero-route, zero-influence, zero-fallback, and zero-authority.
      </p>
    </article>
  );
}
