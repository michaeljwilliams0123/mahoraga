# EXPERIMENT ONLY — Level 7 in-memory mesh

> **Not production Mahoraga.**
> This tree is an isolated scaffold under `experiments/level7-inmemory-mesh/`.
> It must not be treated as a production cutover, main merge candidate, or
> replacement for the existing Node ESM control plane / TypeScript UI.

## Explicit override

On **2026-09-07**, **Michael Williams** explicitly overrode:

- [`docs/ECOSYSTEM-LOCK.md`](../../docs/ECOSYSTEM-LOCK.md)
- Production Execution Runbooks (canonical workspace / operations track)

to authorize this experiment. See [`OVERRIDE.md`](./OVERRIDE.md).

This override does **not** remove GitHub as where this experiment code is stored for
review, does **not** change main protection, and does **not** authorize merging
without explicit human review.

## Runtime vs storage

| Concern | Target |
| --- | --- |
| Code review / durable storage of this experiment | **GitHub** (`experiments/` on branch `experiment/level7-inmemory-mesh`) |
| Runtime | **Local / in-memory** (Node process + optional tmpfs Forgejo stubs) |
| Production Mahoraga authority | Unchanged — GitHub main + existing `.mjs` / `cloud-app` / `operator-deck` |

## What this scaffold contains

- VolatileWorkspaceEngine — Map of virtual files with mount / read / invoke
- SharedMemoryMatrix — SharedArrayBuffer + Atomics + optional workers
- PersistenceDaemon — non-blocking rawText snapshots (default ./var/snapshots)
- RestoreBootstrap — hydrate workspace from snapshots
- TaskStreamQueue — in-memory queue
- MetamorphicCompilerPipeline — transpile + dangerous evaluate path
- VectorASTEngine / DeepASTEngine — TS AST for-loop toward Float64Array.from
- Experimental Helm stubs (Forgejo/Gitea tmpfs + sqlite memory DB)
- Grafana dashboard JSON (illustrative metrics; no Prometheus exporter wired)

## Risks (read before running)

1. Eval / hot-swap — evaluateModule uses a dynamic code path (dangerous). Not a security boundary. No hard vm timeout.
2. Volatile loss — live pointers live in RAM; crash without a fresh snapshot loses evolved state.
3. No exact-head Verify contract — not merge-gated like production Mahoraga changes.
4. DO NOT MERGE without explicit review — PR is for review storage only.
5. Worker fork risk — default smoke uses L7_WORKERS=0.
6. Helm tmpfs Git — experimental YAML only; memory DB + tmpfs loses history on restart.

## Track A status

Track A (canonical workspace operations) WIP was paused/stashed, not abandoned forever unless the owner says so:

- Branch: feat/canonical-workspace-operations-20260907-0237
- Stash: track-a-wip-paused-for-l7-override

## How to run locally

    cd experiments/level7-inmemory-mesh
    npm install
    npm run build
    L7_WORKERS=0 npm start

Short smoke: set L7_WORKERS=0 and run node dist/index.js under an 8-second process timeout.

Env vars: L7_WORKERS, L7_SNAPSHOT_DIR (default ./var/snapshots), L7_SNAPSHOT_MS, L7_MUTATION_MS, L7_INGEST_MS, L7_DRAIN_MS.

## Isolation rules

- Do not delete or rewrite existing src/*.mjs, cloud-app/, operator-deck/, ECOSYSTEM-LOCK, or AGENTS.md to force L7.
- Do not merge to main without explicit owner review.
- Do not implement production cutover or change main protection rules.
