import type { RuntimeCapability } from "@/lib/runtime-relay";
import { projectExecutionBrokerObservation } from "@/lib/execution-broker-observation";

/** Observed capability health is not proof of a live broker service binding or accepted action. */
export function ExecutionBrokerCard({ capabilities = [] }: { capabilities?: RuntimeCapability[] }) {
  const observation = projectExecutionBrokerObservation(capabilities);
  const label = observation.status === "unobserved"
    ? "Tool routes unobserved" : observation.routable > 0
    ? `${observation.routable} of ${observation.observed} tool routes reported routable`
    : "No tool routes reported routable";
  const reasonText = observation.reasons.length ? `Held: ${observation.reasons.join(", ")}.` : "";
  return (
    <article className={`eclipse-status-card ${observation.held > 0 || observation.status === "unobserved" ? "warn" : "neutral"}`} aria-label="Universal execution broker" role="status">
      <span>Universal execution broker — capability observation</span>
      <strong>{label}</strong>
      <p>
        {reasonText} This reports only capabilities observed by the paired runtime.
        A route marked routable does not establish that the private Cloudflare broker has a bound provider,
        owner execution authority, zero-credit admission, or a successful action receipt.
        Missing proof stays unverified; no paid, Railway, or Vercel fallback.
      </p>
    </article>
  );
}
