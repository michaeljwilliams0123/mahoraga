/** Observational copy only. Does not claim a live repository provider or GitHub execution. */
export function RepositoryCapabilityCard() {
  return (
    <article className="eclipse-status-card" aria-label="Repository capability boundary">
      <span>Repository capability</span>
      <strong>Inspect and write independent / unbound</strong>
      <p>
        repository.inspect and repository.write are reported separately from live runtime context and are not UI or runtime flags.
        Each becomes routable only when an executable repository provider is connected to the Cloudflare execution broker and supplies a fresh capability attestation that is healthy and has the required permission class.
        GitHub credentials stay server-side in that provider. Protected-branch checks stay in place. Verify the route plus a bounded real transaction.
        Cloudflare Access authenticates ingress but does not grant GitHub execution. Merge #982 does not claim the unbound production repository provider is live and is not traffic authority.
      </p>
    </article>
  );
}
