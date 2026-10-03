import { BotAuthorityParityCard } from "./BotAuthorityParityCard";

export function UndiciSecurityBumpCard() {
  return (
    <>
      <article className="eclipse-status-card good" data-testid="undici-security-bump">
        <span>HTTP client advisory</span>
        <strong>undici 7.29.1 observed</strong>
        <p>
          Merged #929 pins undici 7.29.1 with @cloudflare/vitest-plugin. Observational dependency provenance only. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. This card does not grant traffic authority, runtime readiness, or production cutover.
        </p>
      </article>
      <BotAuthorityParityCard />
    </>
  );
}
