# Provider retirement history

This file records the provider retirement decision made in PR #118. It is historical evidence, not current routing or readiness authority. Current declared state lives in `mahoraga.manifest.json`; current platform authority lives in `config/platform-lifecycle.json`; live readiness still requires a fresh probe.

## Historical PR #118 scope

### Microsoft

At that time these paths were retired because the operator account had no signed-in Microsoft 365 subscription:

- Microsoft 365 worker
- Dataverse / Microsoft task queue
- Copilot Studio

Later merged work introduced bounded Microsoft and Copilot Studio contracts. Never use this historical list to enable or disable them; follow the manifest, authority scopes, billing evidence, and live provider readiness.

### Chromebook

- `.github/workflows/chromebook-control-plane.yml` was removed.
- Historical cleanup targeted `chromebook/control-plane-v1`, `test/chromebook-control-plane-smoke-20260823`, and `upgrade/microsoft-queue-readiness-20260823`.

## Current authority

- GitHub `main` is source and merge authority.
- Railway service `mahoraga-runtime-main` is the canonical runtime.
- Cloudflare is the staged owner-authenticated edge.
- Vercel hosting is retired and non-routable.
- Codex Builder, desktop, repository, and Microsoft routes remain independently gated by their current manifest state and fresh readiness evidence.
