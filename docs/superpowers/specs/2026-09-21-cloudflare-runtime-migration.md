# Cloudflare runtime migration: verified handoff and design

Date: 2026-09-21
Status: proposed migration; account access blocked; no production cutover performed.
Source inspected: `7cb8aab1129875f798347afdb2844f963e986a65`.

## Owner outcome and constraints

Continue the existing Mahoraga ecosystem: functional chat, bounded tool calls,
persistent identity and memory, truthful readiness in the existing TypeScript
browser UI, and an independently running Cloudflare cloud path. Retire Railway
after state preservation and a real Cloudflare acceptance transaction. GitHub
remains source and protected integration authority; ordinary chat and runtime
execution must not depend on GitHub availability. GitLab is a potentially stale,
read-only assurance mirror. Preserve zero-dollar defaults and do not assume the
owner's expected October 1 credit refresh proves any provider is ready.

This record does not authorize replacing Mahoraga with a new chatbot, weakening
authentication, inventing successful receipts, or enabling metered fallback.

## Verified current state

| Layer | Evidence | Conclusion |
| --- | --- | --- |
| PR 680 | Merged 2026-09-21 18:17:24 UTC, merge a6216f62cec627d87776b786b8019ad6acf092b2 | Ordered merge step 1 complete |
| PR 681 | Merged 2026-09-21 18:22:05 UTC, head 9596ca6fdeca4972da1627c599ca617199c469aa | Ordered merge step 2 complete |
| PR 681 Verify | Run 35637807040, completed/success | Existing exact-head evidence; no rerun requested |
| Source | main 7cb8aab1129875f798347afdb2844f963e986a65 | Source baseline only, not deployment proof |
| Railway | Deployment 0651d94b-815f-4532-8451-7e9e2440a4a5 reports FAILED | No healthy Railway runtime claim |
| Railway storage | Volume c49c9cd0-8bff-462b-ab8e-97dcd4db5e85, 500 MB, /var/lib/mahoraga | Attached; contents and backup status unknown |
| Cloudflare source | Both gateway Wrangler configurations target Railway | Gateway is a proxy, not an independent runtime |
| Cloudflare account | Wrangler 4.132.0 whoami reports not authenticated | No deployment/account inspection authority available in this session |
| Cloudflare connector | No exposed tool; directory search returned no plugin | A connected authenticated execution environment is required |
| Local verification | Four gateway test files, 14 passed, zero failed | Gateway contract tests only; no live execution proof |

Railway project: e644391a-9698-4026-b5e1-a28e07cfaf82.
Service: 0498b161-a6b7-4750-8c54-8c99e0167fa7.
Environment: fb266d3a-7214-47d5-a1a4-d615df3f1e6c.

No secret values were read or exported. No deployment, volume, billing plan,
provider quota, or authentication configuration was changed.

## Why a URL-only migration cannot work

- `deploy/cloudflare-owner-gateway/worker.mjs` authenticates the owner and
  forwards the request to `MAHORAGA_RUNTIME_ORIGIN`; it does not execute tasks.
- `src/database.mjs` constructs Node `DatabaseSync` and uses a filesystem
  database, synchronous statements, transactions, and schema migrations.
- `src/supervisor.mjs` forks worker processes and uses process lifecycle/IPC.
- `scripts/cloud-service.mjs` launches core and workspace child processes.
- `src/native-cloud-model.mjs` currently admits two zero-credit provider IDs:
  codespaces-open-weight and local-open-weight. Workers AI is not integrated.
- `cloud-app/lib/runtime-relay.ts` already defines the UI contract for session,
  conversation, task, capabilities, and operations actions. Keep this contract.
- `scripts/build-pages-static.mjs` exports the existing app, but assumes the
  /mahoraga asset prefix. It is not yet a root-hosted Cloudflare artifact.
- `config/platform-lifecycle.json` still records Railway as canonical runtime.
  Do not flip it to Cloudflare until deployment and acceptance evidence exist.

Cloudflare documents `node:sqlite` as a module stub, not the Node database
implementation. A compatibility flag alone cannot port this database.

## Architecture decision

Three paths were considered:

1. Keep the proxy and Railway: smallest change, fails the requested retirement.
2. Move the existing process runtime to another container host: preserves Node
   semantics, but does not establish a verified free Cloudflare-owned runtime.
3. Port hosting-dependent adapters in bounded TypeScript tranches: recommended.
   Preserve existing authority, cognitive, identity, receipt, and UI contracts.
   Change storage and execution adapters rather than replacing the product.

The target separates an Access-authenticated edge, a durable runtime adapter,
the existing UI artifact, and a bounded model/tool adapter. Persist task leases,
idempotency, events, and encrypted content before returning completion.
Use a SQLite-backed Durable Object as the candidate for synchronous storage and
serialized task ownership; prove transaction and schema compatibility before
adopting it. A D1 async rewrite is an alternative only if measured compatibility
makes the Durable Object approach unsuitable.

Cloudflare's current documentation supports `ctx.access.getIdentity()` for a
directly authenticated Worker. It does not propagate that context through
service bindings, and Static Assets routing does not pass it to the user Worker.
Therefore do not simply add an assets binding to the existing gateway and
assume authentication still works. Keep the direct Access edge and explicitly
validate the downstream assertion boundary, or separately prove a JWT-verifying
application boundary. Never trust a caller-supplied email header.

## Implementation sequence and acceptance contracts

### 1. Recover account and deployment truth

Run pinned Wrangler whoami in the owner's authenticated environment. Read current
Workers, Access policies, bindings, deployment versions, storage resources,
billing plan, and quotas. Record public identifiers and sanitized evidence only.
Do not create an anonymous temporary-account deployment. Compare provider state
with this source baseline before selecting concrete resource names or bindings.

Pass: exact account, owner Access boundary, plan eligibility, and existing
resource inventory are established without credential disclosure.

### 2. Storage compatibility and migration

Extract a storage adapter boundary from `src/database.mjs`, preserving the Node
adapter and existing callers. Introduce TypeScript Cloudflare storage code.
Exercise real Durable Object SQLite in local workerd, not only a fake in-memory
map. Cover transaction rollback, uniqueness, foreign keys, statement results,
schema evolution, lease recovery, and duplicate request suppression.

Preserve conversation/objective/task IDs, execution receipts, identity records,
institutional-memory validity and dissent, and encrypted vault references.
Inventory the Railway volume and produce an encrypted backup with manifest and
digests through an authenticated provider-side operation. Retain encryption keys
in secret storage. Rehearse restoration and compare row counts, relationships,
receipt digests, and decryptability. No private snapshot goes into public git.

Pass: interrupted import is restartable, repeated import does not duplicate
state, restore is verified, and unknown source data is not treated as empty.

### 3. Cloud execution adapter

Replace process-fork assumptions for cloud-capable capabilities with bounded
dispatch through the existing authority/router/receipt contracts. Keep desktop
and local-only routes explicit and unavailable when no authorized device exists.
Use persisted leases and durable wakeups rather than an always-running process.
On restart, reconcile an uncertain external side effect before retrying.

Pass: the same task ID and authority survive restart and provider exhaustion;
duplicate side effects are suppressed; cancellation and owner revocation work.
No chat path reads GitHub to establish routine runtime liveness or authority.

### 4. Cloudflare model and tool route

Introduce a Workers AI provider adapter only after plan and hard-stop eligibility
are verified. Preserve `AuthorityDecision`, bounded input/output, provider
evidence, quota handling, cancellation, and receipt semantics. Do not label a
metered provider unmetered merely because its initial allowance is free.
Account-wide usage and concurrency must be included in cost admission.

Reuse the existing capability broker for typed tools. Model output requests a
capability; the broker independently authorizes it. Unknown tools, authority
expansion, and unavailable external credentials must fail explicitly.
Persistent identity must be grounded in stored identity and live capability
records; a model assertion of self-awareness is not evidence.

Pass: real model answer, one authorized read-only tool call, persisted result,
honest exhausted-provider behavior, and no automatic paid fallback.
October 1 triggers a fresh readiness check, never an unconditional enablement.

### 5. Existing UI hosting and integration

Reuse `cloud-app/` and its current relay/action contracts. Make the export asset
base path host-specific without breaking the existing Pages export. Serve the
same Chat, Control Center, Operations, and Connections surfaces from Cloudflare.
Keep deployment identity distinct from runtime/provider/authority readiness.
If static export is selected, retain an authenticated same-origin API boundary
or the existing explicitly configured bridge; do not create a second app.

Pass: a real browser authenticates, sends chat, sees tool progress/results,
reloads persisted history, cancels a task, and shows correct unavailable states.
The acceptance run must succeed with GitHub and Railway absent from its runtime
network path. Preserve source SHA provenance as deployment metadata.

### 6. Protected integration and cutover

For each behavior tranche: focused RED/GREEN tests, baseline mirror verification
for governed files, diff check, required full verification, and protected
exact-head Ubuntu/Windows checks. Do not request Codex review or rerun unrelated
Actions. Preserve the incumbent trust/evolution contract for protected changes.

Deploy the exact verified source. Record owner-authenticated request -> authority
-> provider admission -> real execution/tool receipt -> persisted result ->
returned browser answer. Source tests alone do not pass this gate.

Only then change canonical lifecycle/origin records and detach Railway traffic
and automatic deployment sources. Retire the service while preserving the
verified backup and a documented rollback. Verify no active Railway runtime or
billing resource remains unintentionally; deleting the volume requires the
backup/restore gate. Do not close unrelated benchmark or attended-device issues
as a side effect of migration.

## Focused verification performed

```bash
node --test test/cloudflare-owner-gateway-security.test.mjs \
  test/cloudflare-owner-gateway-runtime-origin.test.mjs \
  test/cloudflare-owner-gateway-deployment-contract.test.mjs \
  test/cloudflare-owner-gateway-runbook.test.mjs
```

Result: 14 passed, 0 failed. No product code changed in this handoff.
Full repository verification and live Cloudflare acceptance were not performed.

## Official references checked

- [Access identity and limitations](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Node compatibility flags, including SQLite stub](https://developers.cloudflare.com/workers/configuration/compatibility-flags/)
- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

Workers AI lists a 10,000-Neuron daily free allocation. Paid-plan usage above that
allocation is billable; a public repository does not make model inference free.
Actual account plan and usage remain unverified.
