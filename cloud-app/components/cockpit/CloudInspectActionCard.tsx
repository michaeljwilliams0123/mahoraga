/** Observational cockpit surface for #1036. Copy is not a live receipt. */
import { isFreshCloudInspectorCapability } from "@/lib/cloud-inspect-receipt";

type CapabilityHint = {
  capability: string;
  routable: boolean;
  enabled?: boolean;
  provider?: string;
  workerId?: string | null;
  workerIds: string[];
  lastObservedAt?: string | null;
};

export function CloudInspectActionCard({ capabilities = [] }: { capabilities?: CapabilityHint[] }) {
  const hinted = capabilities.some(item => isFreshCloudInspectorCapability(item));
  return (
    <article className="eclipse-status-card" aria-label="Cloudflare read-only inspect">
      <span>Cloudflare read-only inspect</span>
      <strong>{hinted ? "Capability hint only" : "Unattested / hidden"}</strong>
      <p>
        Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. cloud.inspect is a gated Connections control for mahoraga-owner-gateway, not a public endpoint and not traffic authority. The button stays hidden until a fresh cloudflare-readonly-inspector capability is observed. A structurally valid verified flag is not a successful read: the broker receipt must match task and chain IDs, route selection, lease identity, readOnly scope, and an observation at most 90 seconds old. Missing attestation admits zero routes. Execution readiness, cognition readiness, and traffic authority stay separate. No Railway or Vercel fallback.
      </p>
    </article>
  );
}
