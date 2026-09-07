# Copilot / ChatGPT instructions for Mahoraga

You are working in the existing Mahoraga repository. This is not a blank
JavaScript project.

Read `docs/ECOSYSTEM-LOCK.md` and `AGENTS.md` before the first edit.

## Fail closed

- Do **not** rewrite, replace, scaffold over, or "simplify" this repository
  into JavaScript, a Vite app, Create React App, or a new SPA.
- **New browser UI is TypeScript only** in `cloud-app/**`. `operator-deck/**`
  remains a TypeScript reference/control-library layer. Keep `.ts` / `.tsx`;
  do not emit `.js` / `.jsx` UI.
- **There is one deployable browser UI:** `cloud-app/` on Vercel, containing
  Chat, Control Center, Operations, and Connections. Do not recreate
  `operator-deck/` as a second browser deployment.
- **Control plane stays Node ESM `.mjs`** (`src/`, `scripts/`, `test/`,
  `relay/`). Do not mass-convert those trees.
- Java is not the UI language. Do not translate this repo to Java.
- Do not delete `src/`, `cloud-app/`, `operator-deck/`, `.github/`,
  `mahoraga.manifest.json`, `state/release-baseline/`, or `AGENTS.md`.
- Do not restore retired `cloud/`, `web/`, or GitHub Pages frontends.
- Do not activate Windows `7.0.0-alpha.1` or `7.0.0-alpha.2`. Rollback remains `3.6.0`.
- Do not force-push, bypass Protect main, fire Destiny, or spend
  Cloud Pro / metered OpenAI from this session.

## Review transport policy

- Codex is not a code-review path for Mahoraga. It may execute explicitly assigned implementation work only where repository policy otherwise permits it.
- Do not request, retry, or purchase Codex code review. Do not add credits or generate additional review traffic to recover from a review quota condition.
- Codex quota or usage-limit messages are non-blocking infrastructure signals. They are not code defects, merge findings, or reasons to retry a review.
- Use deterministic exact-head GitHub verification and zero-credit repository evidence instead of an unavailable review bot.

## Guardrails

Safety refusals stay in force. They are **local to the disallowed
action**. A refusal is not permission to wipe files or generate a
cleaner JavaScript substitute.

Mahoraga autonomy is bounded GitHub Actions plus Node workers with
fail-closed receipts. It is not a jailbreak. Do not strip it.

If the request is allowed but you are unsure, stop. Do not start over.

## Surfaces

- `cloud-app/` — the one deployable TypeScript browser UI on Vercel:
  Chat, Control Center, Operations, and Connections
- `operator-deck/` — non-deployable TypeScript reference/control-library helpers;
  preserve the tree but do not expose it as a second app
- `src/*.mjs` — existing control plane
- `.github/workflows/sovereign-eight-hour-cycle.yml` — four-hour
  zero-credit candidate cycle; do not rename-to-delete or disable it

The browser UI remains a client of the paired Mahoraga core. Do not add direct
browser GitHub authority, direct provider selection, paid fallback, or automatic
owner confirmation.

Anchor every pasted file with its real path (`// File: cloud-app/app/page.tsx`).
