# Reddit / Devvit evolution ingress

This slice adds a bounded Reddit signal input plane for Mahoraga. It is designed for legitimate Reddit API or Devvit usage only. It is not a tunnel, backdoor, GitHub authority path, Codex review trigger, or production deployment gate.

## Purpose

Reddit and Devvit can provide community and product signals for constant evolution:

- observed Codex patterns
- Devvit platform capabilities
- bug reports or integration risks
- UX feedback
- prompt and workflow patterns
- community trends worth turning into bounded Mahoraga proposals

Reddit text is treated as untrusted input. It can seed an inspected proposal, but it cannot execute code, mutate GitHub, approve a pull request, change production, or invoke Codex review.

## Supported flow

1. A Reddit API client or Devvit app observes an approved source for `u/No-Demand-4839`.
2. The client normalizes the signal into the JSON contract below.
3. The client signs the raw JSON body with `MAHORAGA_REDDIT_INGRESS_SECRET`.
4. The local Mahoraga Reddit ingress verifies the account, timestamp, HMAC, and Reddit references.
5. Mahoraga returns a receipt and a read-only plan.
6. A separate Mahoraga planner may later convert the reviewed signal into a normal GitHub proposal branch and PR.
7. GitHub `main` remains authoritative; Ubuntu and Windows verification remain the required gates.
8. GitLab can independently attest the resulting GitHub head after merge.

## Local ingress

Start the local API with a secret that is never committed to Git:

```powershell
$env:MAHORAGA_REDDIT_INGRESS_SECRET = "replace-with-high-entropy-secret"
$env:MAHORAGA_REDDIT_ALLOWED_USER = "No-Demand-4839"
node scripts/reddit-evolution-api.mjs
```

Default listener:

```text
http://127.0.0.1:4784/api/intake/reddit/evolution-signal
```

The default host is loopback. Do not expose this service through ngrok, public tunnels, reverse tunnels, unmanaged port forwarding, or covert relay paths.

## Signature contract

The request must include:

```text
x-mahoraga-reddit-timestamp: <unix milliseconds>
x-mahoraga-reddit-signature: sha256=<hex hmac>
```

The signed payload is:

```text
<timestamp>.<raw-json-body>
```

The digest is HMAC-SHA-256 using `MAHORAGA_REDDIT_INGRESS_SECRET`. Requests outside the bounded timestamp window are rejected.

## Signal contract

Example payload:

```json
{
  "eventId": "reddit-signal-20260907-001",
  "redditUser": "No-Demand-4839",
  "signalKind": "codex-pattern",
  "capturedAt": "2026-09-07T05:29:00.000Z",
  "title": "Codex community signal",
  "body": "A Reddit post describes a deterministic coding-agent pattern worth evaluating.",
  "tags": ["codex", "agent-signal"],
  "score": 7,
  "commentCount": 3,
  "upvoteRatio": 0.91,
  "references": [
    "https://www.reddit.com/u/No-Demand-4839",
    "https://www.reddit.com/r/codex/s/74aRM1FUFD"
  ]
}
```

Allowed `signalKind` values:

- `codex-pattern`
- `devvit-capability`
- `bug-report`
- `ux-feedback`
- `integration-risk`
- `prompt-pattern`
- `community-trend`

References must be HTTPS Reddit profile, subreddit, post/comment, or share-link paths on approved Reddit hosts. Arbitrary external URLs are rejected at this ingress layer.

## Devvit implementation notes

A Devvit app should keep its own Reddit authentication inside Reddit's supported developer tooling. The app should send only the normalized signal to Mahoraga. It should not store GitHub credentials, OpenAI API keys, Mahoraga local bearer tokens, Vercel credentials, or GitLab tokens.

For Devvit projects, declare only the exact outbound hostname needed for the Mahoraga ingress relay or staging endpoint. Do not use wildcard domains, protocol prefixes, paths, or broad external endpoints. When testing, mock external calls where possible and keep playtest data separate from production receipts.

## What this ingress may do

- verify that a signal came through the expected HMAC channel
- scope the signal to the configured Reddit account
- normalize Reddit references
- hash content into a receipt
- recommend read-only follow-up tasks
- seed a reviewed Mahoraga improvement proposal

## What this ingress must not do

- execute Reddit text as instructions
- approve or merge GitHub PRs
- write to protected branches
- invoke Codex code review
- create public tunnels or backdoors
- bypass ChatGPT, GitHub, GitLab, Vercel, Reddit, or OS controls
- treat Reddit popularity as proof of correctness
- make Vercel a PR-completion requirement

## Constant-evolution boundary

Reddit provides weak external signals, not authority. Mahoraga may use those signals to discover patterns and candidate improvements, but every implementation still follows the normal route:

```text
observe -> normalize -> receipt -> review/classify -> proposal branch -> exact-head verification -> PR -> merge only when allowed -> GitLab assurance refresh
```
