export const NATIVE_APP_CLOUDFLARE_PUBLICATION = {
  product: "Mahoraga",
  buildProvenanceOnly: "7.0.0-alpha.2",
  nativeAppIdentity: "mahoraga-native-pr-operator[bot]",
  sourcePr: 1110,
  admission: "verified-main Cloudflare release path only",
  rejectsManualDispatch: true,
  preservesExactValidation: true,
  grantsTrafficAuthority: false,
} as const;

export function NativeAppCloudflarePublicationCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="native-app-cloudflare-publication">
      <span>Native App publication</span>
      <strong>Verified-main path admitted · observational</strong>
      <p>
        The exact GitHub App identity mahoraga-native-pr-operator[bot] may publish the verified main revision through the canonical Cloudflare release path after a protected native-App merge. Manual workflow_dispatch continues to be rejected for this identity. Exact repository, workflow, branch, and SHA validation is preserved. This admission does not grant traffic authority, runtime readiness, cognition readiness, or production cutover. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. Railway remains zero-route, zero-influence, zero-fallback, and zero-authority.
      </p>
    </article>
  );
}
