# Mahoraga Polyglot Migration Ledger

**Tranche:** 1 — TypeScript foundation and assistant-answer vertical slice  
**Branch:** `feature/polyglot-runtime-architecture` (merged)  
**Source base:** `a5261cb` via PR `#586`; current protected `main` moved on through the 2026-09-18 squash stack  
**Status:** merged to protected `main`; live Railway promotion is a separate evidence domain

## Completed in tranche 1

- Added strict root TypeScript tooling for native Node 24 execution.
- Added deterministic `npm run typecheck` and `npm run language:verify` gates.
- Replaced the old control-plane language lock with an explicit polyglot policy.
- Added `config/language-policy.json` as the machine-readable language contract.
- Added `contracts/worker-result.ts` plus JSON Schema for cross-language worker results.
- Migrated `src/answer-quality.mjs` to typed `src/answer-quality.ts`.
- Migrated its focused test to `test/answer-quality.test.ts`.
- Added typed `src/assistant-result.ts` for assistant completion persistence.
- Wired supervisor and worker-process persistence through the same validated answer contract.
- Preserved exact release-baseline source/mirror equality.

## Remaining JavaScript migration debt

| Tree | JS/MJS/CJS debt | TypeScript files |
| --- | ---: | ---: |
| `src/` | 193 | 2 |
| `scripts/` | 34 | 1 |
| `relay/` | 2 | 0 |
| `test/` | 274 | 5 |
| **Total** | **503** | **8** |

These 503 files are migration debt, not target-state policy violations. The migration remains incremental so every merge leaves `main` bootable and independently verifiable.

## JavaScript exceptions

No ordinary JavaScript exception is approved in tranche 1. `javascriptExceptions` remains empty. Any future retained `.js`, `.mjs`, or `.cjs` file must name the external tooling constraint that requires it.

## Specialized-language status

- **SQL:** not introduced yet; no tranche-1 relational extraction required a new SQL artifact.
- **Python:** not introduced yet; no tranche-1 evaluator/data workload justified a Python execution boundary.
- **C++:** not introduced; no benchmark-proven hot path exists yet.
- **PowerShell/Bash:** existing OS-native operations remain in their current bounded roles.
- **HTML/CSS/TSX:** the single `cloud-app/` UI remains the deployable browser surface.

## Verification evidence before integration

Focused evidence collected during implementation (historical; SHA `0a863a14` was the then-current `main`, not the 2026-09-18 head):

- Root native-TypeScript contract: PASS.
- Language policy: PASS with zero violations.
- Worker-result runtime/type contract: PASS.
- Answer-quality migration: 8/8 focused tests PASS.
- Assistant persistence boundary: 29/29 focused regressions PASS.
- Root `tsc --noEmit`: PASS after each TypeScript tranche.
- Release baseline: 180 mirrored files match after assistant-result admission.
- Refreshed `origin/main`: exact `0a863a14e2f7f3ea784ef794d7b2d1546ea1970c`.
- Branch divergence before full verification: 0 behind main.

Full local verification is now complete: root `npm run verify` executed 1,361 tests with 1,358 passed, 0 failed, and 3 skipped; `npm --prefix cloud-app run verify` executed 72 tests with 72 passed and completed a successful Next.js production build. Protected exact-head CI, Railway deployment, and live chat acceptance remain required before any completion claim.

## Next migration cluster

Tranche 2 should migrate the contract-heavy dependency cluster around:

1. `src/task-policy.mjs`
2. `src/authority-decision.mjs`
3. `src/receipt-registry.mjs`
4. `src/router.mjs`
5. their direct tests and release-baseline mirrors

That cluster maximizes compile-time value around routing/authority without yet forcing the SQLite database or full supervisor into TypeScript.

## Standing invariants

GitHub `main` remains source authority; Railway remains canonical cloud production; protected Windows/Ubuntu exact-head verification remains mandatory; zero-credit routing stays fail-closed; no paid fallback, public raw runtime listener, owner-sovereignty weakening, or parallel UI is introduced by this migration.
