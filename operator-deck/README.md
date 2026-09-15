# Mahoraga operator reference library

`operator-deck/` is a **TypeScript reference/control-library layer** for `michaeljwilliams0123/mahoraga`.

It is **not** a second browser application and is not deployed separately. The singular browser UI is `cloud-app/`, which contains Chat, Control Center, Operations, and Connections in one host-neutral workspace.

## Why this directory remains

The directory preserves bounded, reusable operator concepts and compatibility helpers without creating another execution or deployment surface. Pure helpers under `src/lib/` may be imported by `cloud-app/` where appropriate, but browser mutation authority remains with the paired Mahoraga core.

## Canonical operator surface

Use the verified production origin configured by `MAHORAGA_WORKSPACE_URL` / `MAHORAGA_WORKSPACE_ORIGIN` for browser interaction. The private GitHub repository remains source authority; GitHub Pages may provide a derived static export when enabled, but a Pages URL is not automatically production authority. Historical Vercel projects are not user-facing production surfaces.

- **Chat** — encrypted RuntimeRelay conversation path using the zero-Codex policy.
- **Control Center** — cloud deployment identity, Git SHA, core status, routing policy, and capability readiness.
- **Operations** — core-mediated runtime/repository/repair actions with owner confirmation where required.
- **Connections** — paired relay and capability/worker readiness.

## Language and authority locks

- Browser UI remains **TypeScript**.
- Control plane remains Node ESM `.mjs`.
- This library must never become a parallel direct-GitHub or direct-provider browser authority.
- Owner-authorized authenticated tunnels are permitted; raw 4782/4783 exposure and unauthenticated generic proxies are denied.
- No paid fallback or automatic owner confirmation.

## Related docs

- [../docs/OPERATOR-CONSOLE.md](../docs/OPERATOR-CONSOLE.md)
- [../docs/ECOSYSTEM-LOCK.md](../docs/ECOSYSTEM-LOCK.md)
- [../docs/CLOUD-WORKSPACE.md](../docs/CLOUD-WORKSPACE.md)
- [../.github/copilot-instructions.md](../.github/copilot-instructions.md)
- [VERSIONS.md](./VERSIONS.md)

## Authenticated repository reads

Server-side consumers of `src/lib/fleet/github.server.ts` require `MAHORAGA_GITHUB_READ_TOKEN`, or an existing `GH_TOKEN` / `GITHUB_TOKEN`, scoped to this repository with the read permissions needed for Contents, Issues, Pull requests, and Actions. Supply it through the host's protected environment; never use a `NEXT_PUBLIC_` variable or send it to a browser.

Repository data is fetched only from the authenticated GitHub API. Missing, rejected, redirected, or unavailable reads return `authenticated-read-unavailable`; unavailable visibility is `unknown`. Public HTML/RAW fallbacks and stale-success caching are not used. This read configuration does not grant or change write/merge authority.
