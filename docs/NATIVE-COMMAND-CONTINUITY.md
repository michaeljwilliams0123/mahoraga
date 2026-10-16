# Native command continuity — integrated implementation

## Scope

This tranche reconciles the execution-time source provenance from historical
PR #1113 with canonical command and retry contracts. It does not create a
second router, new Cloudflare Worker, new hosted service or paid inference lane.

### Contract across the existing hops

1. **UI / composed command**: deterministic repo commands may be sent when the
   authenticated runtime is available even when `assistant.respond` is not.
   Compound free-form commands that start with `run /repo admin status` are
   rejected as `repository-admin-command-invalid` rather than silently
   certifying the first part.
2. **Bridge / Gateway**: authentication and owner authorization are unchanged.
   `operations-snapshot`, `operations-action` and `task-action` are absent
   from the canonical Gateway and Durable Object contract; the cloud UI
   refuses them explicitly. They are **not** claimed as operational.
   Existing local relay behavior is unchanged.
3. **Runtime / persistence**: on creation, the execution turn captures the
   runtime source SHA and propagates it to task receipt and history. Legacy
   turns without execution-time source remain unknown; the current deployment
   SHA must **not** be backfilled into them.
4. **Response / reconnection**: when the *chat request itself* returns an
   ambiguous transport error before an acknowledgement, UI offers a
   user-initiated retry with exactly the same conversation and idempotency key.
   It does not auto-run the command, create a new execution identity, or
   retry after chat was accepted and result polling failed. This first stage
   is an in-memory same-page retry, **not** cross-device crash recovery.

### Security and anti-duplication boundaries

- The server's existing owner-scoped durable idempotency enforcement remains
  authoritative; the client cannot grant execution authority.
- No retry for auth failure, ambiguous credentials, routing changes, action
  rejection, or attachment-bearing requests.
- Existing Cloudflare/GitHub identities, bound worker policies, protected
  checks, signed owner assertions and rate/cost policies are preserved.
- Do not infer independent execution verification from a runtime-reported
  source SHA; the latter is provenance metadata requiring matching CI and
  production receipt evidence.

### Integrated acceptance tests

1. Root TypeScript and Cloudflare TypeScript passes.
2. Node command parser, contract and retry identity tests pass.
3. Cloudflare integration tests verify source migration, idempotency and
   native runtime behavior.
4. Control Center tests and Next.js static production build pass.
5. GitHub strict exact-head Ubuntu and Windows Verify and Pages build pass.
6. Protected non-draft squash merge, followed by exact-main Verify and
   canonical Cloudflare production acceptance, before any production claims.
7. Future authenticated mobile end-to-end test: send, lose acknowledgement,
   reconnect, retry with the same idempotency key, and show the original
   immutable execution-time SHA and result ID.

### Next larger tranche, not bundled here

Full cross-device objective recovery with durable client-visible resume
handles and complete `task-action`/Operations handlers should be implemented
as a separate substantial tranche after the canonical action contract is
backed by real handlers and proof. Do not light up unsupported actions simply
by adding them to an allowlist.
