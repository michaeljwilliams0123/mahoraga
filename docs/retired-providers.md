# Retired providers

These paths are out of scope. Do not enable them.

## Microsoft

- Microsoft 365 worker
- Dataverse / Microsoft task queue
- Copilot Studio

Reason: no signed-in M365 subscription on this operator account.

Queue and tenant identifiers must not be treated as live credentials. Workers stay disabled.

## Chromebook

- `.github/workflows/chromebook-control-plane.yml` removed
- Delete leftover branches: `chromebook/control-plane-v1`, `test/chromebook-control-plane-smoke-20260823`
- Delete leftover Microsoft branch: `upgrade/microsoft-queue-readiness-20260823`

## Still in use

GitHub, Vercel workspace, Codex builder, local desktop, repository worker.
