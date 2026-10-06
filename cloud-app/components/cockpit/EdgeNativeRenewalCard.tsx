export function EdgeNativeRenewalCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="edge-native-renewal">
      <span>Edge admission renewal</span>
      <strong>Gateway-owned · observational</strong>
      <p>
        Merged #1008 (3dfe67fb) moves provider admission renewal and capability updates onto the Cloudflare owner gateway. scheduled() runs every minute and renews through the MAHORAGA_EXECUTION_RUNTIME binding when under 30 minutes of canary lifetime remain. chat, execute, and each SSE tick renew lazily when under 5 minutes remain. Single-flight per isolate, a 60s known-fresh cache, and a jittered 30–60s cooldown after failure or missing credentials. Missing gateway secrets stay unconfigured and do not refresh. Runtime /api/provider/refresh stays token-gated, serialized in the Durable Object, replays a refresh within 30s (x-idempotent-replay), and refuses an older attestation over a newer admitted state. Owner-authenticated GET /api/runtime/pages-bridge/events snapshots on change, heartbeats every 10s, lives 5 minutes, then emits reconnect. The bridge frame relays only validated bridge.subscribe and bridge.unsubscribe events to the requesting origin. Primary origin resolves from NEXT_PUBLIC_MAHORAGA_PRIMARY_ORIGIN, then NEXT_PUBLIC_MAHORAGA_BRIDGE_ORIGIN. The top-level replace() handoff is removed. Client status is Offline, Reconnecting, Verifying, Provider Standby, or Idle. A transport blip keeps last-known-good capabilities for 60s, then clears readiness. cloudflare-provider-renewal.yml is owner-only workflow_dispatch break-glass. sovereign-eight-hour-cycle.yml is untouched. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. This card is not execution readiness, cognition proof, or production traffic authority.
      </p>
    </article>
  );
}
