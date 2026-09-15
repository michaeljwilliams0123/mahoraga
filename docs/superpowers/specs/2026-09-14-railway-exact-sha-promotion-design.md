# Exact-SHA Railway Production Promotion - Design

**Status:** Architecture approved by owner in conversation on 2026-09-14; implementation authorized, production dispatch separately gated.

**Date:** 2026-09-14

## 1. Objective

Add one durable, owner-gated GitHub Actions path that promotes the exact current protected `main` commit to the canonical Railway production service without weakening Mahoraga readiness, introducing a second production service, or invoking any model/provider.

The path closes recurring GitHub-main/Railway-source drift while keeping GitHub as the immutable release ledger and Railway as the sole production workspace/runtime host.

## 2. Fixed Production Boundary

The promotion controller is bound in source to the existing canonical production resources:

- repository: `michaeljwilliams0123/mahoraga`;
- branch: `main`;
- Railway project: `e644391a-9698-4026-b5e1-a28e07cfaf82`;
- Railway environment: `fb266d3a-7214-47d5-a1a4-d615df3f1e6c` (`production`);
- Railway service: `0498b161-a6b7-4750-8c54-8c99e0167fa7` (`mahoraga-runtime-main`);
- public origin: `https://mahoraga-runtime-main-production.up.railway.app`;
- strict deployment variable: `MAHORAGA_EXPECTED_GIT_SHA`.

No workflow input may select a SHA, repository, project, environment, service, URL, command, provider, or model.
## 3. Authority and Verification Gate

The workflow is `workflow_dispatch` only and runs only when `github.actor == github.repository_owner`. It has read-only GitHub permissions required to inspect repository/check evidence; the only external mutation authority is the project-scoped Railway token stored as `RAILWAY_PROJECT_TOKEN` in GitHub Actions secrets.

At execution time the controller must:

1. require GitHub Actions, the canonical repository, `refs/heads/main`, and the repository owner as actor;
2. resolve authoritative GitHub `main` and require it to equal the workflow/checkout SHA;
3. fetch check runs for that exact SHA;
4. require the latest `Verify (ubuntu-latest)` and `Verify (windows-latest)` contexts to be completed successfully;
5. fail closed for missing, pending, skipped, cancelled, stale, or failed canonical checks.

GitHub aggregate `UNSTABLE` state and retired Vercel statuses are not promotion authority.

## 4. Promotion Sequence

Before mutation, read the latest successful canonical Railway deployment and its Git `meta.commitHash`. This full SHA is the rollback source and must be valid hexadecimal commit identity.

If production already returns `/api/live = 200` and `/api/ready = 200` with `gitSha` equal to target and `modelInvocations = 0`, return an `already-current` receipt without deployment mutation.

Otherwise:

1. upsert only `MAHORAGA_EXPECTED_GIT_SHA=<target>` with `skipDeploys: true`;
2. call `serviceInstanceDeployV2(serviceId, environmentId, commitSha: target)`;
3. poll the returned deployment until `SUCCESS` or a bounded terminal/timeout state;
4. poll `/api/live` and `/api/ready` until both are valid or the bounded probe window expires;
5. require `/api/ready.gitSha == target` and `modelInvocations == 0` on both public probes.
## 5. Rollback and Mutation Uncertainty

If any post-upsert step fails, restore `MAHORAGA_EXPECTED_GIT_SHA` to the previously successful commit with `skipDeploys: true`, then exact-deploy that previous commit with `serviceInstanceDeployV2`. The rollback is complete only after the rollback deployment reaches `SUCCESS` and public readiness proves the previous `gitSha` with zero model invocations.

A write request is never blindly retried after a response. For transport uncertainty around the deploy mutation, reconcile recent canonical-service deployments for the exact target commit before deciding whether to continue tracking or roll back. Reads may retry with bounded backoff; Railway `429` retry guidance must be honored.

No readiness rule may be weakened to make promotion or rollback pass.

## 6. Receipt and Secret Boundary

The controller emits only a bounded receipt containing state, target SHA, previous SHA, deployment IDs, timestamps, probe outcomes, rollback outcome, and stable error codes. It must never print or persist:

- the Railway project token or GitHub token;
- environment variable collections or unrelated variable values;
- model/provider credentials;
- request/response bodies that could contain application content;
- prompts, conversation content, or private reasoning.

Railway GraphQL failures are normalized to HTTP/status, GraphQL extension code, and trace ID rather than raw provider text.

## 7. Repository Governance

Create `.github/workflows/railway-promote.yml` and a focused Node controller. Add both to `src/repair.mjs` `ESSENTIAL_FILES`, refresh their release-baseline copies, and add deterministic contract tests. The new workflow must declare explicit permissions and contain no `push`, `pull_request`, `schedule`, `workflow_run`, or caller-selected deployment inputs.

The feature PR follows normal protected-main governance: current base, squash only, exact-head `Verify (ubuntu-latest)` and `Verify (windows-latest)`, no bypasses. Merging the feature does not itself deploy production.
## 8. Non-Goals

This change does not create, clone, rename, or delete Railway resources; discover deployment targets from caller input; rotate credentials; add paid/licensed/metered model fallback; invoke a model during promotion; auto-promote on every merge; weaken `/api/ready`; replace the existing GitHub release workflow; or make Railway an authority plane for Mahoraga policy/evolution.

## 9. Testing and Acceptance

TDD must cover owner/repository/main binding, exact canonical checks, fixed Railway IDs, already-current behavior, exact-target deployment, zero-model readiness, sanitized receipts, failure rollback, and deploy-mutation uncertainty reconciliation. Static workflow tests must prove the manual-only trigger, read-only GitHub permissions, project-token secret name, absence of arbitrary inputs, and invocation of the governed controller.

Before the PR is considered mergeable:

- focused promotion tests pass;
- `git diff --check` is clean;
- release baseline verifies after refresh;
- full `npm run verify` passes locally;
- exact PR head passes Ubuntu and Windows Verify.

## 10. Release Boundary

This implementation authorization does **not** authorize firing the production workflow. After the workflow is merged and verified, the first production dispatch requires a separate explicit owner release confirmation in conversation. That confirmation authorizes only the then-current protected-main SHA; if main advances before dispatch, the workflow must target the new current main and the assistant must re-state that exact SHA before execution.