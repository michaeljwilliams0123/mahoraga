# Autonomy gap audit — 2026-09-09

Deterministic ledger only. No model spend.

## Observed

- Before this coordination PR was opened, no other pull requests were open.
- Canonical workspace is `cloud-app/`; its verification contract is `npm run verify` (`tsc --noEmit`, Node tests, then `next build`). Do not substitute Vite/PGLite evidence from another stack.
- Zero-credit ordinary route remains fail-closed: `zero-credit-provider-unavailable` with no paid fallback.
- Issue #244 expected base `dbd7f0b` is stale vs the audited `main` baseline (`b1b87b1`). Contract: stop; do not rebase.

## Open work (assigned owner)

| Issue | Status |
| --- | --- |
| #244 Destiny review-suppression + route hardening | Blocked on fresh exact-head task |
| #238 Destiny cloud-only Work binding | Open |
| #208 Retire duplicate Vercel projects | Operator/account action |
| #183 Destiny binding probe | Intentionally dormant |
| #165 UCCP canary + rollback | Open |
| #85 Destiny attest identity/receipts | Open |
| #83 Contained-branch cleanup ledger | Open |

## Maintain credit-free autonomy

- Keep CI, Dependabot, CodeQL, mailbox, idle runner poll off the model boundary.
- Treat `docs/ZERO-CREDIT-AUTOMATION.md` as the canonical model-spend boundary rather than duplicating an exhaustive trigger list here. It permits deliberate model execution for a new validated Secondary assignment, an explicit retry of failed Secondary work, an owner-created Codex cloud task, a valid `[DESTINY-CODEX]` dispatch PR, an exact registered dispatch command, another declared model-backed provider capability, or **Cloud Pro · explicit**.
- Do not treat `chatgpt-codex-connector` review comments as completion evidence.
- Do not auto-retry failed Secondary work; an operator-explicit retry remains permitted by the canonical boundary.
- Pair a verified open-weight provider before ordinary-route language generation.
