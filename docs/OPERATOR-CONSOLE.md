# Integrated operator surface

Mahoraga has one browser UI: the `cloud-app/` workspace. The last verified
production deployment remains `https://mahoraga-workspace.vercel.app/` while a
provider-neutral Cloudflare Workers replacement is staged and verified.

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

Ruleset `22327855` **Protect main — exact-head Verify** is active on the default
branch.

Required checks:

- Verify (ubuntu-latest)
- Verify (windows-latest)

The unified cloud-workspace build may run as an observational job. Hosting
provider status must not gate PR completion.

Strict up-to-date. No bypass actors. A file in git is not branch protection.

## Deployment truth

GitHub is the evolution/source plane. The browser build is now host-neutral:
`/api/health` prefers `MAHORAGA_*` deployment metadata and retains Vercel
variables only as compatibility fallback, while also recognizing Netlify's
deployment metadata. Control Center renders the hosting provider, environment,
Git ref, and exact deployed SHA.

The Vercel project `mahoraga-workspace` is the last verified production host,
but Vercel Git deployment is frozen while the account quota is exhausted.
Historical duplicate Vercel projects remain non-canonical and must not be used
as production truth.

Cloudflare Workers is the designated replacement-host candidate. Workers may
host the browser application only; it must not create a tunnel or generic proxy
to the local/core runtime. See
[`CLOUDFLARE-WORKERS-CUTOVER.md`](CLOUDFLARE-WORKERS-CUTOVER.md).

A new provider becomes canonical only after its root page, health route, exact
Git SHA, encrypted relay pairing, and zero-paid-fallback boundary pass the same
activation canary.

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
