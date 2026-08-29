# Mahoraga Cloud Workspace

A functional, cloud-only reasoning surface for Mahoraga. It replaces the static capability brochure with streaming chat, file and dataset analysis, grounded web research, live connection states, and an approval-gated isolated-browser adapter.

## Runtime

- Next.js App Router on Vercel
- Vercel AI SDK and AI Gateway
- `openai/gpt-5.6-sol` with OpenAI Pro reasoning mode and maximum effort
- official AI Elements streaming markdown renderer
- up to three attachments, 2 MB each and 4 MB total
- Perplexity Search through AI Gateway for current, cited research
- optional isolated-browser provider with HTTPS/domain validation and signed human approvals

Vercel deployments use project OIDC for AI Gateway authentication. A non-Vercel environment may supply `AI_GATEWAY_API_KEY`. The browser tool remains absent unless all four browser variables in `.env.example` are configured.

## Privacy and authority

The application does not persist conversation history. AI Gateway requests ask for zero-data-retention routing. The browser adapter disables extensions and local-file access, accepts only `synthetic` or `personal` data classification, restricts targets to `BROWSER_ALLOWED_DOMAINS`, and never touches the user's installed Chrome or local device.

Keep the Vercel project private with Vercel Authentication for all previews and production URLs. Do not publish the workspace before authentication and spend controls are enabled.

## Verification

```bash
npm ci
npm run verify
```

The health endpoint is `GET /api/health`. It reports only deployed capability readiness and the cloud/local boundary; it never reports a connector as ready merely because the UI exists.
