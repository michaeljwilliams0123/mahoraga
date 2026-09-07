# Mahoraga operator reference library

`operator-deck/` is a **TypeScript reference/control-library layer** for `michaeljwilliams0123/mahoraga`.

It is **not** a second browser application and is not deployed separately. The singular browser UI is `cloud-app/`, which now contains Chat, Control Center, Operations, and Connections in one Vercel workspace.

## Why this directory remains

The directory preserves bounded, reusable operator concepts and compatibility helpers without creating another execution or deployment surface. Pure helpers under `src/lib/` may be imported by `cloud-app/` where appropriate, but browser mutation authority remains with the paired Mahoraga core.

## Canonical operator surface

Use `https://mahoraga-workspace.vercel.app/` for all browser interaction. The canonical Vercel project is `mahoraga-workspace`; historical duplicate projects are not user-facing production surfaces.

- **Chat** — encrypted RuntimeRelay conversation path using the zero-Codex policy.
- **Control Center** — cloud deployment identity, Git SHA, core status, routing policy, and capability readiness.
- **Operations** — core-mediated runtime/repository/repair actions with owner confirmation where required.
- **Connections** — paired relay and capability/worker readiness.

## Language and authority locks

- Browser UI remains **TypeScript**.
- Control plane remains Node ESM `.mjs`.
- This library must never become a parallel direct-GitHub or direct-provider browser authority.
- No inbound tunnels (`ngrok`, cloudflared, reverse SSH).
- No paid fallback or automatic owner confirmation.

## Related docs

- [../docs/OPERATOR-CONSOLE.md](../docs/OPERATOR-CONSOLE.md)
- [../docs/ECOSYSTEM-LOCK.md](../docs/ECOSYSTEM-LOCK.md)
- [../docs/CLOUD-WORKSPACE.md](../docs/CLOUD-WORKSPACE.md)
- [../.github/copilot-instructions.md](../.github/copilot-instructions.md)
- [VERSIONS.md](./VERSIONS.md)
