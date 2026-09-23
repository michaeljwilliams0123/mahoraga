# Cloudflare hard-zero cognition boundary

Mahoraga must not treat the existing paid Cloudflare account as a zero-dollar Workers AI provider. The production account reports the Standard Workers usage model, where Workers AI can bill above its included daily allocation.

The bounded route is a separate standalone Cloudflare Free account named `Mahoraga Zero-Credit`. Cloudflare Free is the billing boundary: Workers AI can consume only the Free allocation and must fail when that allocation is exhausted rather than roll into paid overage.

The existing Cloudflare account remains the gateway, durable-state, and migration-control account. It is not downgraded because it contains resources outside the Mahoraga execution path. Railway remains untouched rollback infrastructure.

## Provisioning contract

`.github/workflows/provision-cloudflare-zero-credit.yml` is the one-time provisioning lane. It:

- uses the protected `CLOUDFLARE_API_TOKEN` without printing it;
- checks for an existing account with the exact name first;
- sends the required `Idempotency-Key` on account creation;
- requests `standalone: true`, which Cloudflare defines as a standalone Free account;
- creates or reuses only `Mahoraga Zero-Credit`;
- emits only a sanitized account identity receipt;
- performs no subscription mutation, downgrade, deletion, route change, or Railway action.

If the existing token lacks Cloudflare's user-level account-creation permission, provisioning fails closed. In that state the provider remains non-routable and no inference request is authorized.

## Activation gates

Do not activate live cognition until all of these are independently evidenced:

1. The isolated account exists and is verified as standalone Free.
2. The zero-credit inference Worker is deployed in that exact account and exact GitHub SHA is observable.
3. Its inference endpoint is authenticated and bound to the expected account identity and fixed model.
4. The execution runtime has no paid/provider fallback for a zero-credit turn.
5. Provider admission is refreshed from live evidence and expires closed.
6. One synthetic cognition canary succeeds without Railway traversal.
7. Reusing the same idempotency key returns the durable prior receipt without a second provider invocation.

Canonical traffic authority remains a separate later gate.
