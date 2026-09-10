# Autonomy Envelope ↔ Enforced Policy — Alignment Notes

> Purpose: make the design-only envelope in this PR **agree with the fail-closed policy the
> repo already enforces at runtime** in `src/autonomy-policy.mjs` and `src/autonomy-execution-scope.mjs`.
> This strengthens the envelope by matching reality — it does **not** loosen any gate.

## What the enforced code actually guarantees (source of truth)

`src/autonomy-policy.mjs` → `validateAutonomyPolicy()` is fail-closed and throws unless:

- `baseline === "ultron"`
- `conversationActivation`, `structuredDebate`, `automaticIntegration`, `automaticRelease`,
  `canaryRequired`, `rollbackRequired` are **all `true`**
- `maximumImplementationLanes` is an integer in **[1, 2]**
- `requiredVerification === "npm run verify"`
- `protectedPaths` equals **exactly** this frozen set:
  - `.github/workflows`
  - `AGENTS.md`
  - `scripts/autonomous-integration.mjs`
  - `src/autonomy-policy.mjs`
  - `src/autonomous-integration.mjs`
  - `src/config.mjs`
  - `src/github-audit.mjs`
  - `src/update-contract.mjs`

The validated result is **deep-frozen**, so it cannot be mutated at runtime.

`src/autonomy-execution-scope.mjs` → `autonomyAllowedPaths()` defaults writable scope to
`["src", "test"]` and only widens to non-protected areas (docs, scripts, manifest, packages,
UI dirs) by keyword. It never adds a protected path.

## How the envelope maps onto that policy

| Envelope tier | Enforced-policy counterpart |
|---|---|
| `selfRun` (no gate) | Work confined to `autonomyAllowedPaths()` output; lanes capped at 2 |
| `gated` (one confirmation) | `automaticRelease` + `canaryRequired` + `rollbackRequired` — release path keeps canary + rollback |
| `neverAutomated` | `protectedPaths` frozen set — including `autonomy-policy.mjs` protecting **itself** |

## Strengthening actions taken in this PR (docs only)

1. The envelope now records that **`canaryRequired` and `rollbackRequired` are mandatory** on any
   release-tier action — matching the enforced policy rather than implying release is a simple gate.
2. The `neverAutomated` tier explicitly inherits the **frozen `protectedPaths` set**, so no future
   envelope edit can quietly propose touching a self-protecting file.
3. Writable scope is documented as **derived from `autonomyAllowedPaths()`**, not free-form.

## The key safety fact, stated plainly

`src/autonomy-policy.mjs` lists **itself** in `protectedPaths`. The system is designed so an agent
**cannot rewrite its own guardrail**. The envelope must never contradict that — and this alignment
ensures it doesn't.
