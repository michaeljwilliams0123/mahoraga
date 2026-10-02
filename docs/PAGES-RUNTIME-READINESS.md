# GitHub Pages runtime readiness bridge

Research baseline: main `e5cda30645461f0ede94ee20ef804ec8f78ad210`.

The cockpit previously fetched `/api/ready` once from its own origin. GitHub Pages publishes static assets and cannot execute that Next route. The execution Worker's readiness shape also differs from the Next presentation route. Accepting only a `status` string could hide source drift, missing durable storage or stale evidence.

## Route contract

| Hop | Contract |
| --- | --- |
| Pages workspace | Existing authenticated iframe action `readiness`, empty payload |
| Cloudflare owner gateway | Existing `POST /api/runtime/pages-bridge/action`; exact Access owner and same-origin checks remain mandatory |
| Bound execution Worker | Fixed service-binding `GET /api/ready`; no browser-selected target |
| Cockpit projection | `status: ready`, matching published 40-character SHA, `durableState: cloudflare-do-sqlite`, fresh `observedAt`; exact fields only |

The gateway limits upstream response bodies to 4 KiB and fetch/body decoding to five seconds. It cancels stalled or oversized bodies and returns only `cloud-readiness-unavailable` on failure. The observation timestamp is assigned after successful decoding; it describes this probe, not a model invocation. Unexpected fields, including private upstream data, are never forwarded.

The shared client watcher polls serially every 30 seconds while visible. It clears Ready after 60 seconds even if a request remains pending, pauses when hidden, refreshes on visibility changes, and ignores results after disposal. Source SHA must match the workspace's published deployment SHA; missing/mismatched source, stale/future timestamps and incorrect storage remain unproven. The same-origin path uses the existing authenticated HTTP scope; incompatible presentation responses remain unproven. An encrypted Windows relay does not become Cloudflare readiness evidence.

References:

- [GitHub Pages hosting model](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages): static site hosting.
- [Cloudflare HTTP service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/): internal Request/Response calls through configured Workers.
- [Cloudflare Streams API](https://developers.cloudflare.com/workers/runtime-apis/streams/): streaming response bodies.

Behavior tests cover the gateway owner/origin boundary, fixed target, malformed and oversized responses, fetch/body deadlines, strict SHA/storage/freshness validation, non-overlapping polling, hidden views, late results and Pages relay routing without a static-origin API request. This is read-only readiness evidence. It grants no provider, execution, deployment, model activation or Windows promotion authority.
