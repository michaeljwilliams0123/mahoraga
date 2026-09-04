# AI Coding Context

- **Primary language:** TypeScript
- **Target framework (browser UIs):** TanStack Start / Next.js on **Vercel**
- **Existing control plane:** Node.js (`.mjs`) on loopback. Leave it. Do not translate it to Java or to TypeScript unless the owner explicitly starts that migration.
- **Strict rule:** Do **not** rewrite, translate, or suggest changes in any other language. Stick entirely to TypeScript for new UI, cloud-app, and operator-deck work. Never output Java snippets for this repository unless the owner explicitly starts a Java service.
- **App host:** Vercel. Google Workspace is identity, mail, and docs — not the app host.
- **Production rollback:** Windows runtime stays `3.6.0` at `397acebf16766f44e3b4317f9d8b68b10de5f821` until the focused gate, full suite, inactive-runtime smoke, and rollback drill are recorded. Do not activate `7.0.0-alpha.1` on Windows.
- **Operator console:** the TypeScript operator deck is the singular UI for inspect / merge / comment / close / dispatch / eligible deletes. `cloud-app/` remains the ChatGPT-style conversation workspace. Do not iframe Cloud Pro and do not spend Destiny / Cloud Pro from the operator deck.
- **Protect main:** ruleset `22284961` is active. Required checks: Verify (ubuntu-latest), Verify (windows-latest), Verify unified Vercel workspace. Never squash-merge a blocked PR.

Anchor every pasted file with its path and extension (`// File: cloud-app/app/page.tsx`, `// File: operator-deck/src/lib/fleet/execute.server.ts`) so models lock to TypeScript immediately.
