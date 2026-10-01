# Open issue implementation audit

Source inspected: `c09a861`, GitHub main on 2026-10-01. This is a source audit, not deployment or runtime acceptance. All 13 open issues were read in full. No open PR overlapped these tranches at inventory time. A later main invalidates exact-source acceptance evidence.

## Architecture findings

Mahoraga already has a Node 24/TypeScript control plane, SQLite WAL persistence, authority/cost routing, worker supervision, cognitive prediction/calibration, institutional memory, encrypted relay, and bounded evolution. `cloud-app/` is the sole browser UI; Cloudflare owns execution and GitHub owns source. The protected Windows predecessor is 3.6.0. Railway and Vercel confer no execution authority. Configuration defaults still disable production local AI.

The source now contains structured-output validation, semantic retrieval, isolated cognitive clones, and development-only local inference adapters. Rebuilding those would duplicate merged work. `src/desktop-worker.mjs` also already implements recipient-bound Teams send, exact draft/native Send/postcondition checks, and sanitized digests; #376's original implementation description is stale.

Concrete gaps reproduced in tests: GitLab ledgers could match each other without proving current main/freshness; cockpit acceptance booleans lacked a complete SHA/freshness/uniqueness check; no native weight-training/checkpoint pipeline existed. New tranches address those gaps without treating contract tests as live acceptance.

## Issue-to-source map

| Issue | Existing implementation/evidence | Remaining requirement and disposition |
| --- | --- | --- |
| #899 Native Intelligence Program | `src/model-supply-chain.mjs`, cognitive learning/calibration, development-only local inference; no native foundry | Native smoke-training PR: deterministic trainable weights, tokenizer, rights/provenance manifests, disjoint held-out evaluation, save/load, inference and promotion eligibility. Umbrella stays open: no transformer/frontier/native reasoning or production route claim. |
| #862 Cockpit clarity | `CockpitView.tsx`, `CommandCockpit.tsx`, readiness/acceptance contracts | UI PR adds receipt-stage cards and strict evidence projection, keeping transport, cognition, durability and traffic separate. |
| #860 Broker cockpit | universal execution broker, `BrokerLeaseCards.tsx`, interaction lineage | UI PR adds canonical binding, selection and handoff observations to both cockpits. Live broker presence remains unobserved until fresh runtime evidence is supplied; no new endpoint. |
| #786 Governance backlog | operating doctrine, exact-head gates, scheduled lifecycle side-effect controls | These PRs preserve governance; umbrella remains open for deployment producer reconciliation and additional consolidation. Source updates alone cannot settle Cloudflare producer ownership. |
| #733 Historical branch pruning | repository refs and conservative deletion contract | Requires current paginated inventory, ancestry/evidence dependency checks and supported delete-ref mutation. Connected GitHub tools expose no delete-ref operation. No force-moving or fabricated cleanup PR. |
| #663 Executor provenance | exact-head deploy guards and existing acceptance receipts | Assurance PR adds strict objective/SHA/Verify/identity/provenance/freshness and pre-mutation drift contract tests. Live independently attested producer integration remains required; labels/strings alone cannot authenticate an executor. |
| #624 MCCB-v1 | design and benchmark docs; mission leases, participant integrity, budget, dissent, memory, signed-account primitives | Evaluator-owned held-out cohort harness and raw comparative report remain. Preserve external evaluator independence; no candidate-authored success/AGI report. |
| #580 GitLab/Vercel assurance | `src/gitlab-assurance.mjs`, Vercel non-authority test | Assurance PR makes current GitHub main/fresh observations mandatory and rejects empty/duplicate/failed commands; CLI independently resolves main. GitLab secondary role and Vercel non-authority persist. Live secondary run remains required. |
| #571 Ubuntu guest panic | historical QEMU incident; current Verify uses hosted Ubuntu/Windows runners | Historical self-hosted guest isn't the current promotion substrate. Any host recovery requires fresh owner-host identity/SSH/monitor evidence. Do not introduce blind resets or re-register credentials from old incident data. |
| #547 Provider exhaustion | `src/capability-recovery.mjs`, router, universal broker, durable idempotency | Needs external live challenge with two exhausted routes and a fresh authorized third through canonical Cloudflare, preserving dissent/objective/idempotency. Routing simulation cannot close it. |
| #540 Held-out cognition | existing loop/world-model/planner/calibration/learning and evolution differential evaluation | Evaluator-owned exact-head Cloudflare matrix still needs live execution identity and blinded inputs. Do not duplicate predictor or manufacture held-out success. |
| #452 Receipt observability | interaction/delivery lineage cards, existing Cloudflare acceptance report | UI PR validates/displays existing acceptance-report stages and uniqueness counts. Per-request correlation/authority/relay evidence and a real owner-paired transaction remain missing; issue must stay open. |
| #376 Teams send | `src/desktop-worker.mjs` communication.send, fixed UIA, tests in `test/desktop-worker.test.mjs` | Already implemented source; do not duplicate send capability. Fresh attended Windows canaries and empirical promotion evidence remain. No message is sent by this audit. |

## Verification and integration

Each PR is based on the inspected main and has regression tests. Tranches do not mutate production, disable protected checks, widen authentication, select paid routes, delete evidence, or enable models. Draft PRs avoid requesting Codex review. At most three WIP PRs are created. Full test and exact-head CI results belong in each PR, not inferred from this audit.

Deploy/acceptance remains `GitHub main -> exact source SHA -> Cloudflare deployment -> authenticated acceptance`. No source test in this audit establishes that final chain.
