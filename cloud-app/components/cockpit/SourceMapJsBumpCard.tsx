export function SourceMapJsBumpCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="source-map-js-bump">
      <span>Source map advisory</span>
      <strong>source-map-js 1.2.2</strong>
      <p>
        Merged #1005 bumps source-map-js from 1.2.1 to 1.2.2 in cloud-app. Observational dependency provenance only: the pin records the indexed source-map denial of service advisory CVE-2026-93749. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. This pin is not execution readiness, cognition proof, or production traffic authority.
      </p>
    </article>
  );
}
