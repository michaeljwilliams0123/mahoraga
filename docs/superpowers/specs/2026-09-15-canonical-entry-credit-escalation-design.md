# Canonical Entry, Owner Session, and Credit Escalation Design

## Goal
Make Mahoraga feel like one product: the repository opens the live server-capable workspace, normal browser use resumes or establishes an authenticated owner session without relay pairing, zero-credit execution remains first, licensed ChatGPT/Codex-backed routes remain bounded escalation, and Windows status reflects the active runtime rather than the legacy rollback predecessor.

## Canonical entry
- GitHub `main` remains source/evolution authority.
- The repository homepage/website link points to `https://mahoraga-runtime-main-production.up.railway.app/`.
- GitHub Pages is optional static launch/redirect infrastructure only; it is never an execution authority.
- Cloudflare Access may proxy the Railway workspace and mint signed owner assertions, but it may not widen runtime authority or bypass owner authentication.

## Owner session and pairing
- `/api/runtime/session` is the normal browser attachment path.
- A valid same-origin session cookie attaches without user action.
- A browser with no cookie and no signed gateway assertion receives `cloud-owner-auth-required`, not `cloud-gateway-not-configured`.
- The existing direct owner-login flow may then establish the HttpOnly, Secure, SameSite=Strict session.
- Encrypted relay pairing remains recovery/continuity infrastructure and is not offered as the normal path when the cloud runtime is available.
## Credit escalation
- Zero-credit deterministic/local/open-weight routes remain the default.
- Licensed execution is an escalation tier, never a silent replacement for a healthy zero-credit route.
- Existing Codex CLI/question-model and future authenticated Workspace Agent routes are the supported ChatGPT/Codex bridges; ordinary ChatGPT UI sessions are not treated as a generic backend API.
- Quota/backoff evidence must suppress repeated licensed retries after exhaustion.
- Build/evolution work should prefer deterministic repository/local workers and use Codex only when a genuinely generative capability gap remains.
- Owner authority and task-scoped capability authority remain mandatory for side effects.

## Windows presentation
- Active Windows runtime version/provenance comes from the live core status.
- `3.6.0` is labeled only as the legacy rollback predecessor where that historical contract is still relevant.
- The primary workspace must not tell the owner that Windows “is 3.6.0” when a newer active runtime is observed.
- No changes in this worktree will start, stop, or repurpose ports 4783 or 4792.

## Acceptance
1. GitHub repository homepage resolves to the Railway workspace.
2. Railway `/api/ready` is 200 on exact deployed SHA with zero model invocations during health checks.
3. An unauthenticated same-origin session reports owner-auth-required rather than configuration failure.
4. The normal UI exposes owner sign-in instead of a pairing offer when cloud execution is available.
5. Pages cannot masquerade as the live execution UI and routes users to the canonical workspace.
6. Credit escalation remains zero-credit-first and backoff-aware; no automatic loop burns Codex credits.
7. UI copy separates active Windows runtime provenance from legacy rollback metadata.
8. Protected tests, release-baseline mirrors, auth, authority, replay protection, rollback, and evidence semantics remain intact.
