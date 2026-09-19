# Composio integration

Mahoraga exposes a bounded server-side Composio bridge for selected external tools. The initial production-safe capability is a read-only GitHub repository probe using `GITHUB_GET_A_REPOSITORY`.

## Runtime boundary

The browser never receives a Composio credential and cannot choose an arbitrary Composio tool. The owner-authenticated workspace sends the fixed `composio-github-repository` action to the Mahoraga core. The core validates the owner/repository tokens and the Composio client only permits `GITHUB_GET_A_REPOSITORY`.

Required runtime secret:

- `COMPOSIO_API_KEY` — Composio project API key. Store only in the canonical Railway runtime environment.

Optional routing selectors:

- `COMPOSIO_GITHUB_CONNECTED_ACCOUNT_ID` — pins the connected GitHub account. Prefer this when more than one GitHub connection exists.
- `COMPOSIO_USER_ID` — fallback user selector when a connected account ID is not pinned.
- `COMPOSIO_GITHUB_TOOL_VERSION` — optional explicit Composio tool version. Omit it to use the project/tool default.
- `COMPOSIO_API_BASE_URL` — optional override for the Composio API base; defaults to `https://backend.composio.dev/api/v3.1` and must remain HTTPS.

## Verification

1. Run `node --test test/composio-tool-client.test.mjs`.
2. Run the normal repository `npm run verify` and the cloud workspace `npm run verify` before promotion.
3. After deployment, authenticate to the owner workspace, open **Advanced → Connections**, and select **Probe Composio GitHub**.
4. A successful probe reports the repository full name/default branch and the observed GitHub permission projection. The probe performs no repository mutation.

Do not commit the Composio API key, expose it through browser state, or widen `executeComposioTool` to arbitrary caller-selected tool slugs. New tools must be explicitly allowlisted and receive their own bounded input/output projection and tests.
