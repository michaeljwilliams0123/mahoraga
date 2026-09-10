# Read-Only Guardrail Inspection Brief

> **Scope: READ ONLY.** This task package asks the assigned agent to *examine, document, and report* —
> never to edit, merge, deploy, or grant permissions. Output is a report (issue or draft PR containing
> only Markdown findings). Launched manually by the repo owner. Runs only when AI credits are available.

## Why this exists

The repo enforces a fail-closed autonomy policy. Before any agent is pointed at this codebase with
write intent, the enforced guardrails must be **documented and verified intact**. This brief does that
without touching a single protected file.

## Inspection tasks (all read-only)

### 1. Document the enforced policy
In `src/autonomy-policy.mjs` → `validateAutonomyPolicy()`, record every invariant it throws on:
- `baseline === "ultron"`
- the six boolean flags forced `true` (`conversationActivation`, `structuredDebate`,
  `automaticIntegration`, `automaticRelease`, `canaryRequired`, `rollbackRequired`)
- `maximumImplementationLanes` bounds (1–2)
- `requiredVerification === "npm run verify"`
- the exact `protectedPaths` frozen set
Report each as a one-line "invariant → failure message" table.

### 2. Verify protected paths still exist
For each entry in `REQUIRED_PROTECTED_PATHS`, confirm the file/dir is present on `main`:
- `.github/workflows`, `AGENTS.md`, `scripts/autonomous-integration.mjs`,
  `src/autonomy-policy.mjs`, `src/autonomous-integration.mjs`, `src/config.mjs`,
  `src/github-audit.mjs`, `src/update-contract.mjs`
Flag any that are missing or renamed (that would be a silent guardrail gap).

### 3. Find any writer to a protected path
Search `src/` and `scripts/` for code that writes to, commits to, or opens PRs against any
protected path. Report each call site. (Expectation: none should bypass the policy.)

### 4. Confirm scope containment
In `src/autonomy-execution-scope.mjs` → `autonomyAllowedPaths()`, confirm the default/writable
scope never resolves to a protected path. Report the full path-resolution table.

## Explicit non-goals (hard stops)

- ❌ No edits to any file — especially the frozen `protectedPaths` set.
- ❌ No merge, deploy, permission change, or credential handling.
- ❌ No modification of `autonomy-policy.mjs` (it protects itself by design).
- ❌ No secrets or enterprise/local data sent anywhere.

## Deliverable

A single Markdown report: the four tables above + a plain-language "guardrails intact: yes/no" verdict
with any gaps listed. Owner reviews; nothing merges automatically.
