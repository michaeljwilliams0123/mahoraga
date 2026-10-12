export function PortableDeviceMigrationCard() {
  return (
    <article className="eclipse-status-card good" data-testid="portable-device-migration">
      <span>Portable device migration</span>
      <strong>Machine-neutral · owner-controlled</strong>
      <p>
        Merged #1070 (32cd3af) removes SD009WC7 as a required worker label. Sovereign jobs now use [self-hosted,windows,x64,mahoraga,zero-credit]. Current runner remains eligible; owner-approved Windows x64 runners can take over. Private-only Steward fallback available via MAHORAGA_PRIVATE_STEWARD_LOCAL_ENABLED. Enrollment scripts pin official actions/runner digests. Public repo admits no new devices. Product remains Mahoraga; 7.0.0-alpha.2 is build provenance only.
      </p>
    </article>
  );
}
