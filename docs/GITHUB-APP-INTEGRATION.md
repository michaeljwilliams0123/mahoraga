# Native GitHub App integration

Mahoraga uses a repository-installed GitHub App directly through `api.github.com`. No third-party integration broker receives GitHub credentials or proxies repository operations.

## Runtime boundary

The browser receives neither the app private key nor installation tokens. An owner-authenticated action reaches the Mahoraga core, which creates a short-lived RS256 app JWT in memory and exchanges it for an installation token scoped to the `mahoraga` repository and only `contents:write`, `pull_requests:write`, and `metadata:read`.

Required protected runtime secrets:

- `GITHUB_APP_ID`
- `GITHUB_INSTALLATION_ID`
- `GITHUB_APP_PRIVATE_KEY` in PKCS#8 `BEGIN PRIVATE KEY` PEM form

Store these only in the admitted Cloudflare runtime secret store. Do not expose them through browser state, logs, receipts, committed files, or error messages. The accepted Cloudflare runtime does not gain authority merely because these names are documented; Railway remains legacy evidence only with zero-route / zero-influence / zero-fallback / zero-authority.

## Read and write behavior

The read action is fixed to `michaeljwilliams0123/mahoraga`. The write action accepts a bounded file proposal, rejects credential-shaped paths/content before authentication, verifies the expected `main` SHA, builds from that commit's tree, creates a namespaced branch, and opens a draft PR. It never pushes directly to `main`.

Retries reconcile an already-open exact draft PR. A conflicting existing branch/PR fails closed. If post-create readback does not match the requested base/head, the core closes the newly created PR and deletes only the branch it created in that attempt.

## Verification

1. Run `node --test test/github-native-client.test.mjs`.
2. Run the normal root and cloud workspace verification suites before promotion.
3. After deploying the three secrets, authenticate to the owner workspace, open **Advanced → Connections**, and select **Probe native GitHub App**.
4. Treat a successful probe as repository permission evidence only. PR authority remains attended, proposal-bounded, and readback-verified.
