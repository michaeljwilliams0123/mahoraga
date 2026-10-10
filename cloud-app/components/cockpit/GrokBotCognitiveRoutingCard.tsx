export function GrokBotCognitiveRoutingCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="grokbot-cognitive-routing">
      <span>GrokBot cognitive routing</span>
      <strong>Bounded Node children (#1037)</strong>
      <p>
        Merged #1037 routes Node cognitive tasks (assess, deliberate, predict, transfer, cycle, learn) through bounded GrokBot children via fixed TypeScript entry. Observational only: collectives 1–4 children, bounded concurrency, one deadline, cancellation, ordered immutable results, no env inheritance. Admission bound to task identity/input and source provenance; missing/drifting provenance holds dispatch. Receipts retain child/parent IDs, source SHA, authority binding fingerprint. Zero model invocations. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. Not execution readiness, cognition proof, or production traffic authority. Cloudflare cognition unchanged.
      </p>
    </article>
  );
}
