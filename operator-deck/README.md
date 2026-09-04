# Mahoraga operator console

This directory is the **singular operator UI** for `michaeljwilliams0123/mahoraga`.

It is not a second conversation app. `cloud-app/` stays the ChatGPT-style Cloud Pro workspace. This console is the control deck: live GitHub inspect, owner writes (merge / comment / close / dispatch / eligible deletes), the four-hour candidate cycle, and the version ledger.

## Why this exists

Three surfaces were competing:

1. Windows `3.6.0` loopback runtime
2. GitHub candidate `7.0.0-alpha.1` plus the Vercel conversation workspace
3. This operator deck

Operators should work **here** for GitHub and fleet commands, talk in Cloud, and leave Windows `3.6.0` as the rollback. See [VERSIONS.md](./VERSIONS.md).

## Language and host

- **TypeScript** locked. Never Java unless a Java service is started on purpose.
- **Vercel** is the app host. Google Workspace is not.
- Auth stays off on this console. Writes use the owner `gh` session and fail closed without it. Tokens are never rendered.

## What this console will not do

- Activate `7.0.0-alpha.1` on the Windows host
- Fire Destiny / spend Cloud Pro
- Open inbound tunnels (`ngrok`, cloudflared, reverse SSH)
- Squash-merge a PR whose `mergeStateStatus` is not `CLEAN`

## Related docs

- [../docs/OPERATOR-CONSOLE.md](../docs/OPERATOR-CONSOLE.md)
- [../.github/ai-instructions.md](../.github/ai-instructions.md)
- [../docs/UPDATE-CHANNEL.md](../docs/UPDATE-CHANNEL.md)
- [../docs/CLOUD-WORKSPACE.md](../docs/CLOUD-WORKSPACE.md)
