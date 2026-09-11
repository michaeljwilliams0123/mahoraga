# Mahoraga operating contract

## Ecosystem lock (read before any edit)

This repository is a living product. It is not a greenfield JavaScript prompt.

- **New UI is TypeScript only** (`cloud-app/`, `operator-deck/`). Do not convert `.ts` / `.tsx` to JavaScript.
- **Control plane stays Node ESM `.mjs`** (`src/`, `scripts/`, `test/`, `relay/`). Do not mass-convert to `.js`, `.cjs`, or TypeScript.
- **Do not rewrite, replace, or scaffold over this ecosystem** as a JavaScript SPA, Vite demo, or "simpler" app.
- ChatGPT / Copilot / Codex safety refusals are **local to the disallowed action**. They are not a license to wipe, simplify, or JavaScript-replace Mahoraga. If a request is disallowed, refuse it and leave files untouched.
- Windows production rollback remains `3.6.0`. Do not activate `7.0.0-alpha.1` or `7.0.0-alpha.2` on Windows.
- Canonical lock: [`docs/ECOSYSTEM-LOCK.md`](docs/ECOSYSTEM-LOCK.md) and [`.github/copilot-instructions.md`](.github/copilot-instructions.md).

## Review transport policy

- Codex is not a code-review path for Mahoraga. It may execute explicitly assigned implementation work only where repository policy otherwise permits it.
- Do not request, retry, or purchase Codex code review. Do not add credits or generate additional review traffic to recover from a review quota condition.
- Codex quota or usage-limit messages are non-blocking infrastructure signals. They are not code defects, merge findings, or reasons to retry a review.
- Prefer deterministic exact-head GitHub verification and repository-scoped, zero-credit review evidence. Never weaken protected checks to compensate for an unavailable review bot.

Optimize for autonomous execution and short feedback loops.

- Treat `mahoraga.manifest.json` as canonical. Ordinary conversation may plan, debate, implement, verify, integrate, and update without manual routing.
- Primary local Codex, cloud Codex, and Destiny may work autonomously inside declared repository paths. Exact CI-verified same-repository heads may merge automatically; protected-root changes use a reviewed bootstrap PR.
- Keep credentials and private content out of commits, coordination records, and diagnostics. Keep the control API on loopback unless the owner explicitly chooses another deployment boundary.
- Keep capabilities isolated; do not add an unrestricted supervisor shell or caller-selected executable path. Apply connector data-class and spending limits at the execution boundary.
- Preserve task idempotency, crash recovery, immutable update artifacts, canary health checks, rollback, and the user stop/override control.
- During development, run focused tests for changed behavior. Run one full `npm run verify` before a protected bootstrap or release; reuse exact-head green CI evidence instead of repeating equivalent gates.

## Cloud implementation lane

- ChatGPT Work Codex may use the authenticated GitHub connector to inspect the repository, create bounded feature branches, write commits, open pull requests, observe exact-head CI, and complete an owner-authorized merge/deployment without connecting to an owner PC.
- Cloud implementation follows the same repository contracts as every other lane: TypeScript stays in `cloud-app/`, Node ESM stays in `src/`, focused tests precede required CI, and protected changes remain reviewable.
- Adaptive evolution is candidate-based. Generated or proposed changes are isolated, validated, and promoted through branch + CI + review; runtime code must not rewrite the authoritative source tree or bypass verification.
- Connector expansion uses explicit adapters, allowlisted capabilities, scoped credentials, bounded data classes, and observable receipts. “Connect to anything” never means arbitrary code execution, secret fallback values, or unrestricted network listeners.
- Operational dashboards display measured or explicitly unknown state. Simulated counters, synthetic “online” claims, and mock drift scores must be labeled as simulation and cannot stand in for runtime evidence.
