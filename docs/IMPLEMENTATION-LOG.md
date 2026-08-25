# Mahoraga implementation log

Updated: 2026-08-25

## Current wave — Mahoraga 7 Truth and Containment

`7.0.0-alpha.1` is staged in the isolated
`agent/mahoraga-7-truth-containment` candidate worktree. It is not active
production. The wave adds:

- authenticated cookie sessions and one-time local bootstrap nonces;
- server-derived task policy and persisted authority context;
- exact typed capability receipts with fail-closed persistence;
- process/provider/canary separation and evidence-gated routing;
- task-scoped Codex execution cells under candidate worktrees;
- AES-256-GCM content storage with a Windows DPAPI-protected master key;
- stable repair incidents and transition-only recovery records; and
- evidence-derived runtime, provider, canary, routing, and gap-audit surfaces.

Implementation slices were committed without per-slice test runs, honoring the
owner's batch-verification preference. The focused integration gate, full suite,
inactive runtime smoke, rollback drill, and exact-SHA GitHub Codex review remain
pending. No production activation claim is made.

## Previous wave

Wave 8 safe first increment is deployed. The Browser Worker now owns an
isolated headless Chrome profile and can observe only the loopback Control
Center. It records bounded screenshot, network, console, and DOM-title
verification evidence without persisting page content, URLs, cookies, or image
bytes in SQLite.

## Production boundary

The production predecessor and rollback target is `3.6.0` at immutable commit
`397acebf16766f44e3b4317f9d8b68b10de5f821`. This log does not infer current
process health from historical documentation. The candidate smoke must use
alternate port `4783` and temporary state so it cannot stop, mutate, or replace
the production runtime.

## Known boundaries

- Enabled declarations are never treated as route proof; missing or stale
  provider/canary evidence blocks dispatch.
- Historical plaintext rows remain readable through the additive migration;
  all new content-bearing writes fail closed without the local vault.
- Optional providers remain disabled or blocked until their own live evidence
  exists. This wave does not activate Dataverse polling, LM Studio generation,
  GitHub Copilot execution, Workspace Agent cloud, or metered OpenAI API use.
- Production promotion remains pending the recorded release gates and review.
