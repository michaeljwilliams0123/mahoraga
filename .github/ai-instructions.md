# AI Coding Context

- **Primary UI language:** TypeScript
- **Target framework (browser UI):** Next.js in `cloud-app/`, served by the canonical Railway production service. GitHub Pages is an optional derived launcher, not runtime authority.
- **Existing control plane:** Node.js (`.mjs`) on loopback. Leave it. Do not translate it to Java, to JavaScript, or to TypeScript unless the owner explicitly starts that migration.
- **Strict rule:** Do **not** rewrite, translate, replace, or scaffold over this repository in any other language. Stick entirely to TypeScript for new UI and for `cloud-app/` / `operator-deck/` work. Never convert TypeScript UI to JavaScript because a model has guardrails or prefers JS.
- **Do not wipe the ecosystem.** Do not delete `src/`, `cloud-app/`, `operator-deck/`, `.github/`, `mahoraga.manifest.json`, or `state/release-baseline/` in order to "start clean".
- **Guardrails:** a ChatGPT / Copilot safety refusal is local to the disallowed action. It is not permission to generate a JavaScript substitute. See [`docs/ECOSYSTEM-LOCK.md`](../docs/ECOSYSTEM-LOCK.md).
- **App host:** Railway service `mahoraga-runtime-main` from authoritative GitHub `main`. Google Workspace is identity, mail, and docs — not the app host.
- **Production rollback:** `3.6.0` at `397acebf16766f44e3b4317f9d8b68b10de5f821` is the protected Windows rollback predecessor, not proof of the active runtime. Current Windows state requires fresh host evidence. Do not activate a candidate from browser UI work.
- **Singular browser UI:** `cloud-app/` is the one deployable browser UI and contains Chat, Control Center, Operations, and Connections. `operator-deck/` remains a non-deployable TypeScript reference/control-library layer; preserve it but never recreate it as a second browser app.
- **Authority boundary:** the browser remains a client of the Mahoraga core through the authenticated owner-session or bounded recovery relay. No direct browser GitHub authority, direct provider selection, paid fallback, or automatic owner confirmation.
- **Protect main:** ruleset `22502690` (`Protect main - exact-head Verify`) is active with no bypass actors. Treat every PR as blocked until Verify (ubuntu-latest) and Verify (windows-latest) pass on its exact current head. Never squash-merge a blocked or stale-head PR.
- **Vercel boundary:** Vercel is retired and non-routable. Vercel provider or deployment status is not a PR completion gate, runtime fallback, or authority signal.

## Review transport policy

- Codex is not a code-review path for Mahoraga. It may execute explicitly assigned implementation work only where repository policy otherwise permits it.
- Do not request, retry, or purchase Codex code review. Do not add credits or generate additional review traffic to recover from a review quota condition.
- Codex quota or usage-limit messages are non-blocking infrastructure signals. They are not code defects, merge findings, or reasons to retry a review.
- Prefer deterministic exact-head GitHub verification and repository-scoped, zero-credit review evidence. Never weaken protected checks to compensate for an unavailable review bot.

Anchor every pasted file with its path and extension (`// File: cloud-app/app/page.tsx`, `// File: operator-deck/src/lib/fleet/execute.server.ts`) so models lock to TypeScript immediately.
