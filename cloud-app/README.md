# Mahoraga Workspace

A single Vercel-hosted reasoning and execution surface for Mahoraga. It replaces
the split cloud/local experience with one workspace that can use streaming cloud
reasoning, file and dataset analysis, grounded web research, an approval-gated
isolated browser, or the owner-paired encrypted relay to the loopback runtime.

## Runtime

- Next.js App Router on Vercel
- Vercel AI SDK and AI Gateway
- `openai/gpt-5.6-sol` with OpenAI Pro reasoning mode and maximum effort
- official AI Elements streaming markdown renderer
- up to three attachments, 2 MB each and 4 MB total
- Perplexity Search through AI Gateway for current, cited research
- optional isolated-browser provider with HTTPS/domain validation and signed human approvals
- fixed `wss://relay.mahoraga.app/pair` browser endpoint for end-to-end encrypted runtime pairing
- zero-Codex default route with no automatic paid-model fallback
- fixed Cloud Pro ceilings: 14 context messages, 48,000 retained text characters, 12,000 new-turn characters, 8,000 output tokens, five tool steps, and 6,000 search tokens

Vercel deployments use project OIDC for AI Gateway authentication. A non-Vercel environment may supply `AI_GATEWAY_API_KEY`. The browser tool remains absent unless all four browser variables in `.env.example` are configured.

The default conversation route requires the paired runtime. Relay chat is
server-forced to `creditPolicy: zero-codex`; deterministic capabilities continue
without a model and unconfigured generation waits rather than consuming Codex
or AI Gateway credits. Cloud Pro is always an explicit UI selection.

## Privacy and authority

The application does not persist conversation history. AI Gateway requests ask for zero-data-retention routing. The browser adapter disables extensions and local-file access, accepts only `synthetic` or `personal` data classification, restricts targets to `BROWSER_ALLOWED_DOMAINS`, and never touches the user's installed Chrome or local device. Runtime relay plaintext is encrypted in the browser and can be opened only by the paired runtime; the relay broker cannot read it.

Keep the Vercel project private with Vercel Authentication for all previews and production URLs. Do not publish the workspace before authentication and spend controls are enabled.

## Verification

```bash
npm ci
npm run verify
```

The health endpoint is `GET /api/health`. It reports only deployed capability readiness and the cloud/local boundary; it never reports a connector as ready merely because the UI exists.
