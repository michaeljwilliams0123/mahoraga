# Mahoraga operating contract

Optimize for autonomous execution and short feedback loops.

- Treat `mahoraga.manifest.json` as canonical. Ordinary conversation may plan, debate, implement, verify, integrate, and update without manual routing.
- Primary local Codex, cloud Codex, and Destiny may work autonomously inside declared repository paths. Exact CI-verified same-repository heads may merge automatically; protected-root changes use a reviewed bootstrap PR.
- Keep credentials and private content out of commits, coordination records, and diagnostics. Keep the control API on loopback unless the owner explicitly chooses another deployment boundary.
- Keep capabilities isolated; do not add an unrestricted supervisor shell or caller-selected executable path. Apply connector data-class and spending limits at the execution boundary.
- Preserve task idempotency, crash recovery, immutable update artifacts, canary health checks, rollback, and the user stop/override control.
- During development, run focused tests for changed behavior. Run one full `npm run verify` before a protected bootstrap or release; reuse exact-head green CI evidence instead of repeating equivalent gates.
