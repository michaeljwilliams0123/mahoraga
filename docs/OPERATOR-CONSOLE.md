# Integrated operator surface

Mahoraga has one browser UI: the host-neutral `cloud-app/` workspace. The
canonical production browser origin is the exact host configured through
`MAHORAGA_WORKSPACE_URL` / `MAHORAGA_WORKSPACE_ORIGIN` only after its deployed
Git SHA, health, and encrypted pairing state are verified. GitHub Pages may
publish a derived static export when enabled; it is not execution authority.

The former operator-console concept is integrated into that workspace rather
than deployed as a second application.

## Split of duties inside the single UI

| Job | Surface |
|---|---|
| Conversation and zero-Codex task submission | Chat |
| Hosting provider, deployment identity, exact deployed Git SHA, core/routing/capability status | Control Center |
| Runtime/repository/repair actions and verification | Operations |
| Relay pairing and capability/worker readiness | Connections |
| Local runtime activation of verified releases | Windows / Chromebook loopback `127.0.0.1:4782` |
| Destiny fire, paid fallback, browser direct GitHub/provider authority | Hard deny in the browser UI |

`operator-deck/` remains a TypeScript reference/control-library layer only. It
is not a separate hosted project or user-facing surface.

## Protect main

Ruleset `22502690` **Protect main - exact-head Verify** is active on the default
branch.

Required checks:

- Verify (ubuntu-latest)
- Verify (windows-latest)

The unified cloud-workspace build may run as an observational job. Hosting
provider status must not gate PR completion.

Strict up-to-date. Pull request required. Squash merge only. Deletion and
non-fast-forward updates are blocked. No bypass actors. A file in git is not
branch protection.

## Deployment truth

GitHub `main` is the evolution/source plane. The browser build is host-neutral:
`/api/health` prefers `MAHORAGA_*` deployment metadata and retains provider
variables only as compatibility inputs. Control Center renders the hosting
provider, environment, Git ref, and exact deployed SHA without treating the
provider itself as authority.

No historical Pages, Vercel, Railway, Cloudflare, Netlify, or other provider URL
is canonical merely because it once deployed successfully or appears in repo
metadata. A server-capable host may replace a static host where server routes are
required, but it must not create a tunnel or generic proxy to the local/core
runtime.

A provider becomes canonical only after the configured production origin's root
page, health route, exact Git SHA, encrypted relay pairing, and zero-paid-fallback
boundary pass the activation canary. Repository visibility and hosting-provider
identity do not grant execution authority.

## Four-hour self-update

Workflow file is still named `.github/workflows/sovereign-eight-hour-cycle.yml`.
Display name is **Sovereign Four Hour Candidate Cycle**. Cron heartbeats at
minute 7/22/37/52 every hour. The 4-hour window is software (tags
`sovereign-cycle-anchor-v2-*` / `sovereign-cycle-complete-v2-*`), not cron.

Self-update opens a candidate PR. It does not activate Windows 7.0. Merge still
requires exact-head Verify.

## Language and authority lock

TypeScript for `cloud-app/`. Existing Node.js `.mjs` control plane stays. Do
**not** convert the UI to JavaScript.

Browser surfaces remain clients of the paired core. They must not become direct
GitHub mutation authority, direct provider selectors, automatic
owner-confirmation paths, paid-fallback routes, or inbound tunnels.
