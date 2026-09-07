# Explicit override — Level 7 in-memory mesh experiment

**Date:** 2026-09-07  
**Owner:** Michael Williams (`michaeljwilliams0123`)

Michael Williams explicitly overrode:

1. [`docs/ECOSYSTEM-LOCK.md`](../../docs/ECOSYSTEM-LOCK.md)
2. Production Execution Runbooks (canonical workspace / operations track)

…in order to authorize this **isolated experiment** under `experiments/level7-inmemory-mesh/`.

This override does **not**:

- authorize a production cutover,
- remove GitHub as the review/storage authority for the rest of the repository,
- change main branch protection,
- merge this experiment without explicit human review,
- delete or rewrite existing `src/*.mjs`, `cloud-app/`, `operator-deck/`, ECOSYSTEM-LOCK, or `AGENTS.md`.

Track A (canonical workspace operations) WIP was paused/stashed on
`feat/canonical-workspace-operations-20260907-0237` (`stash@{0}: track-a-wip-paused-for-l7-override`).
It is not abandoned forever unless the owner says so.
