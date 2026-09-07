# Integrated operator surface

Mahoraga has one browser UI: the canonical Vercel `cloud-app/` workspace at `https://mahoraga-workspace.vercel.app/`.

The former operator-console concept is now integrated into that workspace rather than deployed as a second application.

## Split of duties inside the single UI

| Job | Surface |
|---|---|
| Conversation and zero-Codex task submission | Chat |
| Deployment identity, exact deployed Git SHA, core/routing/capability status | Control Center |
| Runtime/repository/repair actions and verification | Operations |
| Relay pairing and capability/worker readiness | Connections |
| Local runtime activation of verified releases | Windows / Chromebook loopback `127.0.0.1:4782` |
| Destiny fire, paid fallback, browser direct GitHub/provider authority | Hard deny in the browser UI |

`operator-deck/` remains a TypeScript reference/control-library layer only. It is not a separate Vercel project or user-facing surface.

## Protect main

Ruleset `22327855` **Protect main — exact-head Verify** is active on the default branch.

Required checks:

- Verify (ubuntu-latest)
- Verify (windows-latest)

`Verify unified Vercel workspace` may run. It must not gate PR completion.

Strict up-to-date. No bypass actors. A file in git is not branch protection.

## Deployment truth

The canonical Vercel project is `mahoraga-workspace`. Root `vercel.json` enables Git-driven deployment so a verified merge to `main` can update that workspace. Historical Vercel projects linked to the repository are non-canonical and must not be used as production truth.

The browser health route publishes non-secret deployment identity (`VERCEL_ENV`, `VERCEL_URL`, `VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF`), and Control Center renders the commit SHA so stale production is visible immediately.

Vercel bot/review output remains non-blocking for PR completion; repository-native exact-head verification is the code gate.

## Four-hour self-update

Workflow file is still named `.github/workflows/sovereign-eight-hour-cycle.yml`. Display name is **Sovereign Four Hour Candidate Cycle**. Cron heartbeats at minute 7/22/37/52 every hour. The 4-hour window is software (tags `sovereign-cycle-anchor-v2-*` / `sovereign-cycle-complete-v2-*`), not cron.

Self-update opens a candidate PR. It does not activate Windows 7.0. Merge still requires exact-head Verify.

## Language and authority lock

TypeScript for `cloud-app/`. Existing Node.js `.mjs` control plane stays. Do **not** convert the UI to JavaScript.

Browser surfaces remain clients of the paired core. They must not become direct GitHub mutation authority, direct provider selectors, automatic owner-confirmation paths, or paid-fallback routes.
