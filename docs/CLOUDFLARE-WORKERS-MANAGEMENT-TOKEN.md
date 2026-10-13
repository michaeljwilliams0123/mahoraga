# Cloudflare Workers management token — verified capability wiring

The owner created an expanded Cloudflare API token and saved it as the **repository Actions secret**
`CLOUDFLARE_WORKERS_MANAGEMENT_TOKEN`. Merely saving a GitHub secret never gives Cloudflare Workers or Mahoraga a capability: a workflow must explicitly reference the secret and Cloudflare must authorize its operations.

## Independent, auditable activation

- The production pipeline in `.github/workflows/cloudflare-execution-runtime.yml` continues to use its established `CLOUDFLARE_API_TOKEN`. **Do not overwrite it.** The separate audit credential remains read-only.
- The **Verify Cloudflare Workers Management Token** workflow is manual, owner-triggered and exact-verified-main-only. It checks the same-source Ubuntu and Windows Verify statuses, the token's own Cloudflare verify endpoint (account or user token), and an actual GET of the broker's 100% deployment. The returned sanitized receipt reports **read access only**, not an untested promise of edit/create authority.
- The operation **create-and-deploy-private-canary** additionally requires the existing account-level hard-zero billing attestation, verifies current main again immediately before mutation, then uses the new management credential only as Wrangler's `CLOUDFLARE_API_TOKEN` for this step. Wrangler creates/updates **only** `mahoraga-workers-management-canary` from tracked TypeScript source. The canary is private: no Workers.dev route, preview URL, custom route, resource binding, secret, database, gateway, or runtime authority.
- After deployment, the workflow uses the *same new token* for live Cloudflare deployment/Worker-version readback. A single 100%-traffic version with the exact-main `TARGET_SHA` plaintext binding is required. The sanitized acceptance receipt establishes successful create-or-update/deploy and provenance, **not** that any model/connector bot can already invoke management mutations.
- Changes to production Worker source still travel through the existing protected GitHub PR/Verify and canonical exact-main deployment. No direct credentials are sent to browsers, tasks, logs, or GitHub issues.

## How to operate

1. Go to [Verify Cloudflare Workers Management Token](https://github.com/michaeljwilliams0123/mahoraga/actions/workflows/cloudflare-workers-management.yml) in GitHub Actions on the **merged main**.
2. Choose **Run workflow**, branch **main**, operation **verify**. A failure such as `management-credential-unavailable` means the exact Actions secret name or account ID is missing/inaccessible; a Cloudflare denial may mean an invalid/expired/restricted token, wrong account scope, or insufficient Workers permission. Tokens are never displayed in logs.
3. After verified-read-access, choose **create-and-deploy-private-canary** if you want live proof of creation/deployment. Cloudflare's current granular roles require **Workers product Admin** to create a new Worker; **Workers Editor** only edits/deploys existing Workers. With Editor but without Admin, this canary creation fails safely at the Cloudflare/ Wrangler permission gate. Resource-level Admin on an existing Worker does not enable new Worker creation.
4. See the redacted version/commit readback in the Action logs. Failure does not justify widening GitHub/Cloudflare scopes, bypassing the billing gate, or replacing the current production deployment token.

No automatic scheduling, public URL, permanent generic management proxy, token refresh/issuance, payment entitlement change, or broad task-to-Cloudflare mutation route is created by this workflow.
