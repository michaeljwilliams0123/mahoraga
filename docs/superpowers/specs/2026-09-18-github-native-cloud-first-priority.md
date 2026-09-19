# GitHub-Native Cloud-First Priority Addendum

Date: 2026-09-18
Status: owner approved
Applies to: `docs/superpowers/specs/2026-09-18-github-pages-sovereign-control-plane-design.md`

## Owner direction

Mahoraga's migration is cloud-first. When GitHub can cleanly own a responsibility, GitHub is the preferred provider because the repository, Pages, Actions, releases, artifacts, Issues/PRs, API/MCP surface, and Copilot development workflow already live there.

The migration must not introduce another cloud dependency merely to recreate functionality GitHub already provides well.

## Provider selection order

For each responsibility, evaluate providers in this order:

1. **GitHub-native** when the capability fits GitHub's product model and operational limits.
2. **Cloudflare complement** when an always-on HTTP/API/session/state/edge capability is required that GitHub Pages or bounded GitHub Actions jobs do not provide.
3. **Plugin/MCP/SaaS provider** when the capability belongs to an external system or has a materially stronger specialized implementation.
4. **Local/device execution** for hardware, desktop, private-network, or heavyweight execution that is unsuitable for hosted ephemeral runners.
5. **Railway compatibility fallback** only during migration, until parity and rollback evidence permit retirement.

## GitHub-native responsibilities

Prefer GitHub for:

- canonical source and branch authority;
- GitHub Pages static/browser UI hosting;
- Pages build and deployment through GitHub Actions;
- deterministic CI and verification;
- bounded event-driven jobs;
- repository mutation and review through GitHub API/MCP;
- Issues, PRs, Projects, releases, and deployment evidence;
- build artifacts and release artifacts when their retention/size model is appropriate;
- code-generation/development assistance through Copilot surfaces;
- workflow dispatch and repository-dispatch based execution triggers;
- auditability through commits, checks, deployments, and PR history.

## Responsibilities GitHub must not be forced to emulate

Do not turn GitHub Actions into a fake always-on application server. GitHub-hosted Actions jobs are ephemeral and have bounded execution duration; Pages is static hosting and does not run server-side Node/Python application routes.

Therefore the following require a complementary control/runtime service unless they can be redesigned away:

- always-on low-latency HTTP API;
- server-held session/authentication secrets;
- durable session/replay/throttle state requiring synchronous request access;
- WebSocket/SSE coordination that must remain available independent of workflow runs;
- long-lived objective coordination that must resume without occupying an Actions runner;
- provider gateway behavior that must answer browser requests continuously.

The preferred complement for those responsibilities is Cloudflare Workers plus suitable managed state/orchestration, behind stable Mahoraga contracts so Cloudflare remains replaceable.

## Cloud-first operating rule

A local PC is an execution provider, not the control-plane dependency. Mahoraga must remain operational for cloud-capable objectives when SD00, BV, or any other local device is offline.

Local devices may provide `desktop.execute`, hardware-specific, heavyweight, and private-network capabilities. Their absence should degrade only those capabilities, not Mahoraga's UI, objective feed, planner, journal, or cloud routing.

## Architectural test

Before introducing a new hosted component, answer:

1. Can GitHub provide this function cleanly and reproducibly?
2. Would doing so fit GitHub's static/event-driven/ephemeral execution model rather than fighting it?
3. Does the function require an always-on request/response or durable session surface?
4. Can the provider remain behind a stable Mahoraga capability/API contract?

Use GitHub when answers 1 and 2 are yes. Use the external control-plane complement when 3 is yes. Preserve 4 in every case.

## Immediate migration consequence

The first implementation tranche is explicitly GitHub-first:

1. GitHub Pages stops redirecting to Railway and serves the real exported Mahoraga workspace.
2. GitHub Actions remains the only UI build/deployment pipeline.
3. The browser receives a single `MAHORAGA_API_ORIGIN` configuration boundary.
4. Railway continues temporarily only as the compatibility API/runtime target behind that boundary.
5. No new UI hosting service is introduced.
6. The next tranche extracts the always-on gateway from Railway into the preferred cloud control-plane complement while leaving the Pages UI unchanged.

This addendum strengthens, and does not replace, the security, rollback, provider-agnostic, receipt, and verification requirements of the parent design.