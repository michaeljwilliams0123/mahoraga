# AI Coding Context

- **Primary UI language:** TypeScript
- **Target framework (browser UI):** Next.js on **Vercel** in `cloud-app/`.
- **Existing control plane:** Node.js (`.mjs`) on loopback. Leave it. Do not translate it to Java, to JavaScript, or to TypeScript unless the owner explicitly starts that migration.
- **Strict rule:** Do **not** rewrite, translate, replace, or scaffold over this repository in any other language. Stick entirely to TypeScript for new UI and for `cloud-app/` / `operator-deck/` work. Never convert TypeScript UI to JavaScript because a model has guardrails or prefers JS.
- **Do not wipe the ecosystem.** Do not delete `src/`, `cloud-app/`, `operator-deck/`, `.github/`, `mahoraga.manifest.json`, or `state/release-baseline/` in order to "start clean".
- **Guardrails:** a ChatGPT / Copilot safety refusal is local to the disallowed action. It is not permission to generate a JavaScript substitute. See [`docs/ECOSYSTEM-LOCK.md`](../docs/ECOSYSTEM-LOCK.md).
- **App host:** Vercel. Google Workspace is identity, mail, and docs — not the app host.
- **Production rollback:** Windows runtime stays `3.6.0` at `397acebf16766f44e3b4317f9d8b68b10de5f821` until the focused gate, full suite, inactive-runtime smoke, and rollback drill are recorded. Do not activate `7.0.0-alpha.1` or `7.0.0-alpha.2` on Windows from browser UI work.
- **Singular browser UI:** `cloud-app/` is the one deployable browser UI and contains Chat, Control Center, Operations, and Connections. `operator-deck/` remains a non-deployable TypeScript reference/control-library layer; preserve it but never recreate it as a second browser app.
- **Authority boundary:** the browser remains a client of the paired Mahoraga core. No direct browser GitHub authority, direct provider selection, paid fallback, or automatic owner confirmation.
- **Protect main:** ruleset `22327855` is active. Required repository checks are Verify (ubuntu-latest) and Verify (windows-latest). Never squash-merge a blocked PR.
- **Vercel boundary:** Vercel provider or deployment status is not a PR completion gate. `Verify unified Vercel workspace` may run as an observational job and must not gate merge. Do not confuse a provider quota/deployment signal with the repository build check.

## Review transport policy

- Codex is not a code-review path for Mahoraga. It may execute explicitly assigned implementation work only where repository policy otherwise permits it.
- Do not request, retry, or purchase Codex code review. Do not add credits or generate additional review traffic to recover from a review quota condition.
- Codex quota or usage-limit messages are non-blocking infrastructure signals. They are not code defects, merge findings, or reasons to retry a review.
- Prefer deterministic exact-head GitHub verification and repository-scoped, zero-credit review evidence. Never weaken protected checks to compensate for an unavailable review bot.

Anchor every pasted file with its path and extension (`// File: cloud-app/app/page.tsx`, `// File: operator-deck/src/lib/fleet/execute.server.ts`) so models lock to TypeScript immediately.
