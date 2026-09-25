# Always-on cloud runtime

GitHub `main` is source authority. Cloudflare `mahoraga-execution-runtime` is the canonical server-capable execution runtime for a verified and accepted exact SHA. The Access-protected `mahoraga-owner-gateway` supplies owner identity and uses the `MAHORAGA_EXECUTION_RUNTIME` service binding for native actions. The isolated `mahoraga-zero-credit-inference` Worker enforces the hard-zero provider budget. GitHub Pages presents the derived `cloud-app/` browser workspace. These are distinct evidence boundaries: an accepted execution-runtime receipt does not establish an owner browser session or custom-domain traffic promotion.

On 2026-09-25, [run 36087031059, attempt 3](https://github.com/michaeljwilliams0123/mahoraga/actions/runs/36087031059) accepted exact SHA `eabfedd95877847bc8cdf407dfe0559d7a56bcbe`. It tested Cloudflare Access, served provenance, fresh billing/provider evidence, real cognition, stale-SHA rejection, one execution under concurrent duplicate requests, durable replay across a Worker redeploy, fail-closed zero-dollar admission, and no Railway fallback. A subsequent `main` merge invalidates this SHA as current acceptance evidence until its own hosted run passes. `/api/live` is liveness; `/api/ready` is application/provenance readiness. Neither alone grants owner authority or proves traffic/domain promotion.

Railway `mahoraga-runtime-main` and its persistent volume remain rollback/evidence infrastructure. It is non-routing in the Cloudflare execution path. Do not delete or promote Railway as a side effect of Cloudflare acceptance. Windows 3.6.0 remains the protected device rollback predecessor.

## Owner and command boundary

The gateway requires the exact owner identity from Cloudflare Access `ctx.access`, and rejects unauthenticated calls with `403 owner-access-required`. A caller-supplied identity header is never sufficient. Mutations require the gateway's same-origin policy and a bounded action allowlist. Its `MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET` signs an assertion to the execution runtime; the protected `OWNER_GATEWAY_SECRET` must be the same assertion secret there. Do not place either value in tracked variables, reports, or browser storage. No caller may select an arbitrary upstream, command, or paid provider. Unknown native routes fail closed rather than proxying Railway.

The bridge serves `chat`, `tasks`, `messages`, and `message-content` through the service binding. It requires a protected `CONTENT_VAULT_KEY` and independently verified hard-zero admission in the execution Durable Object. Without fresh evidence the provider is unroutable; no automatic licensed, paid, Codex, or Railway fallback is allowed.

## Production verification

1. Require protected exact-head Ubuntu and Windows Verify for the intended `main` SHA. Confirm that SHA remains authoritative before mutation.
2. Run the owner-gated exact-main Cloudflare workflow. It proves same-account Billing Read, deploys the isolated provider and execution runtime, admits a fresh provider canary, then deploys the owner gateway. The scheduled job renews provider evidence without deploying.
3. Require its sanitized live acceptance receipt on the same SHA. Inspect `accessProtected`, `runtimeAttestationVerified`, `trafficAuthorityVerified` for the Cloudflare execution route, `providerCognitionVerified`, `hardZeroBillingVerified`, `failClosedZeroBillingVerified`, `noRailwayFallbackVerified`, `durableContinuityVerified`, and `executionUniqueness.atMostOneVerified`. The receipt must contain no prompt, response, or credential value.
4. Independently prove owner browser authentication and one real Pages/gateway/native-bridge transaction at the chosen origin before declaring that entire user path complete. Verify any custom-domain/DNS promotion as a separate traffic authority claim. Cloudflare execution acceptance does not self-promote a browser hostname.
5. After every merged source change, repeat exact-main acceptance. Keep Railway on standby for separately authorized rollback only; never infer Cloudflare failure from Railway health or call Railway during this path.

## Cloudflare owner gateway deployment

1. `npm run cloudflare:owner-gateway:whoami` identifies the intended Cloudflare account. The workflow uses the protected deployment token and the `MAHORAGA_EXECUTION_RUNTIME` service binding; it does not need `MAHORAGA_RUNTIME_ORIGIN` or a Railway hostname.
2. `npm run cloudflare:owner-gateway:secret:owner` stores `MAHORAGA_CLOUD_OWNER_ID` for the pinned owner identity. `npm run cloudflare:owner-gateway:secret:assertion` stores `MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET`, the same assertion secret as runtime `OWNER_GATEWAY_SECRET`. Never print or commit either secret.
3. `npm run cloudflare:owner-gateway:deploy` deploys the exact verified source. Protect its production `workers.dev` URL with Cloudflare Access and verify the owner identity through `ctx.access`; without `ctx.access` the gateway returns `403 owner-access-required`.
4. Observe a fresh authenticated browser transaction through the gateway and native service binding. `npm run cloudflare:owner-gateway:deployments` lists the provider deployment, but a deployed version is not a substitute for that end-to-end check.

Historical Railway container/pin recovery remains documented in the archived 2026-09-14 [promotion design](superpowers/specs/2026-09-14-railway-exact-sha-promotion-design.md). It is a rollback procedure, not current canonical promotion policy.
