# Bounded Cloudflare read-only action worker

First executable broker provider for the canonical Owner Gateway. It is **not** browser or desktop control, a GitHub write route, or autonomous merging. It executes the fixed `cloud.inspect` capability using a genuine live Cloudflare account API deployment read and returns a brokered receipt.

## Authority and zero-credit boundaries
- Existing private execution broker, normal owner-authenticated gateway, lease and receipt protocol; no bearer in the browser and no new public endpoint. `workers_dev=false`, `preview_urls=false`.
- Dedicated, new `CLOUDFLARE_AUDIT_TOKEN` requires **Workers Scripts Read only** on the relevant account. Do not reuse GitHub App credentials or the deployment token. `CLOUDFLARE_ACCOUNT_ID` is only an account identifier, but is supplied as a protected variable.
- The provider advertises `cloud.inspect` only after a live HTTP 200 + valid account deployment proof for the Owner Gateway. Missing or denied credentials => no attestation; broker keeps zero action routes.
- Requested permission **read**, scope `cloud:read`, exact worker/provider identity, unexpired ≤60-second lease, bounded evidenceRefs. Target scripts are hard-coded to the Owner Gateway, execution runtime and execution broker. Neither arbitrary account endpoints nor write calls exist.
- `zeroCreditEligible` refers to **no paid inference/Codex model usage**. Cloudflare request billing is governed by the owner's Cloudflare plan. Do not assume or claim an unlimited free quota.
- No production deployment until the owner opts in and independent account-level zero-dollar spend controls have been validated. Workers/GitHub Actions deployment actions are separate, already-authorized administrative operations.

## Activation after exact-head CI and owner-approved merge
1. Create a **new** narrowly scoped Workers Scripts Read Cloudflare token. Set it as the repository Actions secret `CLOUDFLARE_READONLY_AUDIT_TOKEN`; retain existing deployment `CLOUDFLARE_API_TOKEN` for Wrangler only. Existing `CLOUDFLARE_ACCOUNT_ID` is reused.
2. Independently test GET `/client/v4/accounts/<account>/workers/scripts/mahoraga-owner-gateway/deployments` with that token. It must return a single current 100% deployment. No tokens or private responses enter logs.
3. Set repository Actions variable `MAHORAGA_READONLY_PROVIDER_ENABLED=true` **only after explicit owner permission** and verified zero-dollar boundary. Leave unset/false for fail-closed existing behavior.
4. Run the existing owner-only `Deploy and Accept Exact Main on Cloudflare` workflow (or wait for its admitted next exact-main run). The workflow deploys the private inspection provider **before** deploying the broker bound through `CLOUD_PROVIDER`; if token or upstream verification is unavailable it fails instead of advertising a fake route.
5. Check broker `/api/capabilities` returns **cloud.inspect** with a freshly validated `cloudflare-readonly-inspector` attestation and no arbitrary action classes. Issue an authenticated gateway `execute` request for target `mahoraga-owner-gateway`, `requestedPermission=read`, `authorityScopes=[cloud:read]`, `constraints.requireZeroCredit=true`; require the real Cloudflare deployment ID/version in its execution receipt. Repeat from iPhone and desktop with independent owner sessions.
6. Verify no arbitrary script access, no writes, no paid route, no cross-owner history leak, no Railway/Vercel fallback. Record a redacted exact-main receipt. Disable the variable to return to the legacy no-provider configuration on a subsequent owner-approved deployment.

## Safe-by-default release behavior
The ordinary broker configuration remains `deploy/cloudflare-execution-broker/wrangler.jsonc` with **no** external providers. The opt-in file `wrangler.readonly-provider.jsonc` binds only the new private Worker. No existing native GitHub App secret is copied or redistributed. This is one initial **read-only** live action, not unrestricted action authority.

## Broker binding diagnostics (read-only, internal)

The private broker's `GET /api/capabilities` includes a bounded `providerReadiness` summary in addition to its unchanged `routes` array. It never advertises a capability unless a valid, healthy attestation is admitted.

- `unbound` / `no-provider-service-bindings`: no provider service bindings are configured on the deployed broker. First inspect the live Worker settings, not only the checked-in opt-in Wrangler configuration.
- `unverified` / `provider-proof-unavailable`: at least one provider is bound, but no valid, unexpired attestation was accepted. Check the independent read-only token, permissions, upstream proof, and deployment.
- `unavailable` / `provider-capability-unhealthy`: valid attestation exists, but no healthy capability is routable.
- `admitted`: one or more routable capabilities passed the existing broker attestation rules. This is not proof of owner execution permission or a successful actual action.

The counts, symbolic binding names, and reason codes are intentionally non-secret. This diagnostic is an internal broker observation, **not** an authentication bypass, runtime health guarantee, canary substitute, model-admission signal, or new authority decision. Missing secret/disabled opt-in must never become a synthetic or paid fallback.
