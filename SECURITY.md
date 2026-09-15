# Security policy

## Supported code

Security fixes target the current `main` branch. Historical branches are retained
as coordination and recovery evidence and are not separately maintained.

## Reporting a vulnerability

Use GitHub's private vulnerability-reporting form for this repository. Do not
open a public issue or pull request containing an exploit, credential, private
endpoint, personal data, chat content, browser data, or raw provider response.

If the private form is unavailable, contact the repository owner through an
existing trusted private channel and include only the minimum reproduction
metadata needed to route the report. Never commit a credential as test data.

## Security boundary

Mahoraga's control service remains bound to 127.0.0.1. Owner-authorized authenticated
tunnels may terminate at a scoped gateway/relay, but raw 4782/4783 listeners and
unauthenticated public desktop/runtime exposure are not supported. GitHub may contain
source code, bounded task metadata, and deterministic repository evidence only. Runtime tokens,
prompts, model responses, personal files, browser history, document content,
and unrelated chat context are prohibited.
