# Authenticated Cloudflare work and routing truth

## Scope
Closes a source/UI consistency gap related to #973 and #452. This is a bounded
read-only projection of the signed-in owner's existing Durable Object turn ledger;
it is not a replacement for the SD00/local supervisor operations service.

- An authenticated `operations-snapshot` reads `turns` joined to `conversations`
  on the server-confirmed `owner_id_hash`. No user-supplied owner selector is accepted.
- Actual statuses are PENDING, SUCCESS and FAILED. They project as owner turn
  pending, completed and failed; they are **not** estimates of cloud worker queue
  capacity or availability. Historical records remain durable on the existing DO.
- Cloud snapshots explicitly label waiting/queued work, workers, repairs,
  objectives, authority, release rollback and fresh GitHub main as **unobserved**.
  The runtime `TARGET_SHA` is displayed as deployed-source provenance only.
- Operations mutations remain unavailable over the canonical cloud path.
  Local supervisor actions are not silently forwarded through Cloudflare.
- UI connection state is the actual authenticated session, not
  `assistant.respond` readiness. Native `/repo` commands can work without a
  general language model.
- Build/Ship now submit the documented `auto` mode only after an admitted,
  routable, zero-credit development worker is present. General text generation,
  repository inspection, or a metered Codex route cannot satisfy that gate.
  Without one, the user sees an explicit HOLD and no task is submitted.

## Acceptance
1. Focused unit and existing runtime/UI regressions must pass.
2. Exact PR head passes protected Ubuntu and Windows Verify.
3. Squash main and verify exact-source canonical Cloudflare acceptance.
4. In a real authenticated owner session, Work and Advanced -> Operations
   display owner-scoped PENDING/SUCCESS/FAILED counts, deployed SHA, and the
   distinction between unknown vs zero. No data from a different owner can appear.
5. With no development worker, Build/Ship produces a clear route-hold message
   and does not submit a model request or mutate GitHub.
6. With a separately admitted free builder and language interface, validate
   a real issue-backed diff and receipt before declaring autonomous development.
   **This PR does not satisfy issue #1145's unattended candidate-PR proof.**

## Zero-credit scope
No secrets or external provider bindings were added. No metered review or
model inference is necessary to exercise this read-only snapshot.
