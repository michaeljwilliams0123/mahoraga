# Always-on cloud runtime

Mahoraga production runs as one OCI service on the canonical Railway service `mahoraga-runtime-main`. The Node ESM control plane remains bound to `127.0.0.1:4782`; only the Next workspace is exposed on port 3000. `/api/live` proves the published listener is alive, while `/api/ready` independently checks strict application and deployment provenance. Neither endpoint invokes a model.

State is mounted at `/var/lib/mahoraga`. SQLite WAL state, encrypted content, artifacts, cloud-gateway replay nonces, and bounded idle receipts survive process restarts. `scripts/cloud-service.mjs` supervises the control plane and workspace with bounded restart behavior and model-free idle checks.

## Owner and command boundary

The browser automatically tries `/api/runtime/session` on page load, then falls back to the encrypted Windows relay only when the cloud session is unavailable. The cloud endpoint does not accept a caller-supplied owner assertion. A Cloudflare Access-protected Worker authenticates the pinned owner and adds a fresh HMAC assertion. The app exchanges that assertion for an HttpOnly, SameSite=Strict signed session and requires same-origin, CSRF, timestamp, and durable one-use nonce checks for every action.

The Worker uses `MAHORAGA_RUNTIME_ORIGIN` as its single host-neutral upstream binding. Production points that value at `https://mahoraga-runtime-main-production.up.railway.app/`. The Worker rejects malformed, credential-bearing, non-HTTPS, or self-looping origins before it signs or proxies a request. Caller-supplied Mahoraga owner assertion headers are stripped and replaced with a newly signed assertion.

The gateway has an explicit action allowlist. It cannot execute a caller-supplied command, open a port forward, or select an arbitrary destination. Runtime credentials remain server-side. `licensed-approved` remains a one-turn owner action; idle and automatic retry paths never select it.

## Compatibility diagnostics

The authenticated session response includes a public, content-free runtime contract: the same-origin session/action protocol revision, runtime/control-plane revision, and fallback kind. A missing or incompatible contract fails closed before the browser considers the optional encrypted relay. The attended Windows runtime remains a rollback/bootstrap plane and is not production authority for this cloud path.

## Production verification

1. Keep `mahoraga-runtime-main` bound to authoritative GitHub `main`, Dockerfile build, `node scripts/cloud-service.mjs`, the persistent `/var/lib/mahoraga` volume, and Railway platform healthcheck `/api/live`.
2. Keep `MAHORAGA_CONTENT_VAULT_MASTER_KEY`, `MAHORAGA_PRIMARY_CODEX_TOKEN`, `MAHORAGA_CLOUD_SESSION_SECRET`, `MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET`, `MAHORAGA_CLOUD_OWNER_ID`, and the independent expected deployment SHA in Railway configuration, never in Git or browser-visible state.
3. Require a fresh Git-backed Railway deployment whose served commit equals authoritative GitHub `main`; `/api/live` must return 200 and `/api/ready` must return 200 only when strict provenance/core readiness is satisfied.
4. Deploy `deploy/cloudflare-owner-gateway` as the owner edge. Set its `MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET` to the matching assertion secret, bind `MAHORAGA_CLOUD_OWNER_ID` to the Cloudflare Access-authenticated owner, and set `MAHORAGA_RUNTIME_ORIGIN` to the canonical Railway HTTPS origin.
5. Point the owner-facing hostname at the Access-protected Worker rather than bypassing it. Verify an unsigned request is rejected, a valid Access-authenticated request establishes the owner session, replay is denied, and the browser never receives assertion or session secrets.
6. Prove one real owner-bound zero-credit request from the production UI through AuthorityDecision, verified provider admission, model execution, durable task/event/result persistence, and returned answer before treating downstream receipt UI as production proof.
7. Retain exact-head Ubuntu and Windows Verify receipts before promotion. Roll back Railway by promoting a previously verified image/source revision; do not weaken `/api/ready` to make a deployment green.

## Exact-SHA promotion and readiness mismatch recovery (#552)

`MAHORAGA_EXPECTED_GIT_SHA` is an independently approved, full 40-character
commit pin. Railway's automatic deployment of a new `main` commit does not
advance that pin. A successful platform deployment can therefore serve
`/api/live` = 200 while `/api/ready` correctly returns 503 with
`deployment-provenance-mismatch`. Platform success is not application readiness.

For every production promotion, including documentation-only merges:

1. Resolve the exact authoritative GitHub `main` SHA and retain the required
   Ubuntu and Windows Verify evidence for the integrated PR head. Do not use
   a PR head SHA as the production pin after a squash merge.
2. Inspect the canonical Railway production environment and service. Require
   the deployment metadata to identify the same repository, `main` branch,
   and exact merged SHA. Capture the deployment ID and the fresh `/api/ready`
   JSON body; do not diagnose from HTTP status alone.
3. If the reason is `deployment-provenance-mismatch`, reconcile the independent
   `MAHORAGA_EXPECTED_GIT_SHA` pin to that verified merged SHA through the
   authorized Railway configuration path and redeploy that revision. Change
   only this variable; preserve owner credentials, provider policy, persistent
   storage, and the platform `/api/live` healthcheck.
4. Re-read GitHub `main` and Railway metadata after deployment. If `main` moved
   during promotion, reconcile against the newly verified revision before
   claiming convergence. Never substitute an older successful deployment for
   evidence about the current revision.
5. Require fresh `/api/live` = 200, `/api/ready` = 200 with the exact merged
   `gitSha` and `modelInvocations: 0`, and an unauthenticated
   `/api/runtime/session` = 401. Persist a bounded receipt with timestamp,
   source SHA, deployment ID, endpoint results, and provider/authority state.
   These probes do not prove provider admission or model execution; record
   those states as unverified unless separate authenticated evidence exists.
6. If readiness still fails, investigate the new reason. Missing provenance,
   core gateway rejection, connection failure, and timeout are separate
   defects; a corrected pin does not prove those dependencies are healthy.

Never set the expected pin from `RAILWAY_GIT_COMMIT_SHA` inside application
startup, use a self-referential variable to make the two values always equal,
remove the mismatch check, or return readiness success based only on liveness.
For rollback, independently approve and deploy the rollback revision and
reconcile its expected pin as one promotion operation; retain the prior
deployment and evidence for recovery.

## Cloudflare owner gateway deployment

### Native assistant bridge prerequisites

The owner gateway forwards `chat`, `tasks`, `messages`, and `message-content` only through the `MAHORAGA_EXECUTION_RUNTIME` service binding. Configure the execution runtime's protected `OWNER_GATEWAY_SECRET` to the same value as the gateway's protected `MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET`. The runtime verifies a timestamped HMAC over the owner and exact request body; absent or mismatched secrets reject native calls. Never put the shared value in tracked variables or a deployment receipt.

The native chat path requires a protected `CONTENT_VAULT_KEY` and fresh, independently verified hard-zero provider evidence in the execution Durable Object. Without those prerequisites the capability remains unroutable and requests return `zero-credit-provider-unavailable`. Workers AI free allocation alone cannot be used to set `zeroCreditEligible`. The licensed path remains unavailable until a separate cloud-callable licensed provider and one-turn authorization are configured and verified. The existing Railway proxy is only an explicit rollback path.

1. `npm run cloudflare:owner-gateway:whoami` must identify the intended Cloudflare account.
2. Confirm Railway production is the canonical `mahoraga-runtime-main` service and `/api/ready` is green at current GitHub `main`.
3. Run `npm run cloudflare:owner-gateway:secret:owner` and enter only the owner identity authorized by the Access policy.
4. Run `npm run cloudflare:owner-gateway:secret:assertion` and enter the same assertion secret configured as Railway `MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET`; never print or commit the value.
5. Run `npm run cloudflare:owner-gateway:deploy`.
6. Protect the exact production `workers.dev` URL for `mahoraga-owner-gateway` with Cloudflare Access and allow only the pinned owner identity.
7. Until Access authenticates the invocation, without `ctx.access` the Worker must return `403 owner-access-required`; a caller-supplied identity header is never sufficient.
8. Authenticate through Access as the owner and verify the Worker reaches the canonical Railway hostname, establishes the normal server-side owner session, and never exposes the HMAC assertion secret.
9. Run `npm run cloudflare:owner-gateway:deployments` and record the deployment/version identifier with the exact Git SHA used for verification.
