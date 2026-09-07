# Singular UI Finalization Design

## Goal

Make `cloud-app/` the one canonical Mahoraga browser UI and remove the visible split between an updated repository and a stale/partial deployed workspace.

## Architecture

`cloud-app/` remains the only deployable browser application. It owns four real in-app surfaces: **Chat**, **Control Center**, **Operations**, and **Connections**. `operator-deck/` remains a TypeScript reference/control-library layer only and is not presented as a second deployable application.

All execution, mutation, provider selection, and consequential actions remain owned by the paired Mahoraga core through `RuntimeRelay`. The browser must not gain direct GitHub authority, direct provider authority, automatic owner approval, or paid fallback behavior.

## User experience

- **Chat** keeps the existing encrypted RuntimeRelay conversation flow and zero-Codex policy.
- **Control Center** replaces the pressure-test cockpit as the primary status surface. It shows deployment identity, cloud health, paired-core state, routing policy, and capability readiness.
- **Operations** keeps the existing core-mediated snapshot and owner-confirmed action flow.
- **Connections** shows encrypted relay posture and the exact capability/worker routes reported by the paired core, with pair/revoke controls.
- Remove navigation entries that only render "coming later" placeholders. Unsupported capabilities remain visible as explicit non-routable status inside Control Center/Connections instead of fake pages.

## Deployment identity

`/api/health` exposes non-secret build metadata derived from Vercel runtime variables: product version, deployment environment, deployment URL, Git commit SHA, and Git branch/ref when present. The Control Center renders the commit SHA so a stale deployment is immediately detectable from the UI.

## Deployment policy

Root `vercel.json` currently disables Git deployments. After the UI passes exact-head verification, change `git.deploymentEnabled` from `false` to a branch map that disables feature-branch previews while allowing `main` production deployment. Unspecified branches default to true in Vercel, so the map must explicitly disable the active UI feature branch and leave `main` enabled for this release path; subsequent branch-preview policy should remain non-gating and must never become a PR completion requirement.

## Documentation truth

Repository docs must say there is one Vercel browser UI. References to a second deployed operator console are replaced with the integrated Control Center/Operations model. `operator-deck/` documentation identifies it as a non-deployable reference/control library.

## Testing

TDD contract tests must fail first for:

1. canonical four-item navigation and absence of placeholder tabs;
2. Control Center wiring and visible deployment commit identity;
3. Connections wiring to RuntimeRelay capabilities with no direct GitHub/provider authority;
4. health route build metadata;
5. Vercel Git deployment no longer globally disabled;
6. docs describing one browser UI.

Then run `npm test`, `npm run typecheck`, `npm run build`, and repository exact-head verification. Vercel bot/review status remains non-blocking; repository-native verification remains the gate.
