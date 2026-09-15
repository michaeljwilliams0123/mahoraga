# Recipient-Bound Teams Send Design

## Status and scope

This design implements GitHub issue #376 on top of protected `main` at `2c12a50c278c06b816cb014a14f6243031a7964b`.
It extends Mahoraga's existing attended Windows desktop worker with one separately registered human-communication side effect: `communication.send` for Microsoft Teams.
It does not widen `desktop.interact`, add generic UI Automation, introduce Graph credentials, or create broadcast/contact-discovery authority.

The design follows the Universal Capability Fabric human-communication boundary: a real human recipient must be explicitly bound by the owner's objective, and send authority must remain separate from read, discovery, health, and focus authority.

## Goals

- Send one exact message to one explicitly owner-bound recipient through the already authenticated Teams desktop client.
- Verify recipient, exact draft, native Send control, and post-send state before returning `verified: true`.
- Preserve task idempotency and prevent automatic duplicate sends after uncertain failures.
- Keep message text and unrelated chat content out of receipts, logs, Git, and durable operational metadata.
- Keep startup/readiness probes non-side-effecting.

## Non-goals

- No channel, team, mailing-list, department, group, or arbitrary broadcast sends.
- No autonomous recipient discovery, directory enumeration, fuzzy recipient selection, or inferred targets.
- No generic caller-provided executable, PowerShell, UIA selector, coordinates, keystrokes, or script.
- No token, cookie, credential, Teams profile, or chat-history extraction.
- No Microsoft Graph messaging path in this change.
## Capability and policy contract

`communication.send` is added to the existing `desktop` worker, but it is not a descendant of `desktop.interact` authority. The desktop worker remains attended/local and deterministic-cost.
The public intake admits `communication.send` only when the request contains a bounded `recipient` plus a non-empty exact message in `requestedOutcome`; broad-recipient language remains blocked before planning.
The task policy classifies the capability as `personal`, requires an active attended session, binds the authority session ID, and forces `maximumAttempts = 1` regardless of the queue default.
The owner-provided task idempotency key remains the durable duplicate guard already enforced by the task database.

The planner may select `communication.send` only when all of the following are true:
- the text is a send/message request;
- Teams is explicitly named;
- the recipient is explicit and non-broad;
- a `communication.send` route is admitted/plannable.

Broad-recipient requests continue to return `recipient-not-authorized` before any send route can be selected.

## Execution contract

The worker uses one fixed Teams-specific Windows UI Automation script. JavaScript passes only the recipient and exact message as process environment values, never as executable/script text or selector input.
The script requires exactly one visible `ms-teams` application window and an interactive user session.
It binds the active chat to the requested recipient using bounded visible identity evidence; ambiguity or mismatch fails closed.
It finds exactly one enabled message composer, sets the exact message, reads it back, then locates and invokes the native Teams Send control. It must not use blind Enter/SendKeys as the side effect.
After invocation it requires the same recipient binding and an empty composer; when available it also verifies a bounded hash-equivalent sent-message signal without returning message text.

All negative states return bounded reason codes such as `teams-window-required`, `recipient-mismatch`, `draft-mismatch`, `send-control-unavailable`, and `post-send-verification-failed`.
## Receipt and privacy contract

Successful and failed worker results may persist only content-free evidence:
- application = `teams`;
- action = `recipient-bound-send`;
- recipientSha256, messageSha256, and idempotencyKeySha256;
- exact-window count and boolean recipient/draft/send/post-send verification flags;
- bounded reason code.

The raw recipient, raw message, window title, chat text, accessibility tree, tokens, cookies, and stdout/stderr never enter receipt metadata.
The existing receipt sanitizer remains authoritative; the `communication` capability family is explicitly registered rather than disguised as `desktop`.

## Readiness and canary contract

`desktop.inspect` remains the worker health probe. `communication.send` must not be `provider-derived` because desktop health cannot prove write authority.
Startup/readiness refresh must never send a message. The capability is registered with an explicit non-side-effecting canary mode that leaves its canary state `never` until an attended operator-triggered send canary succeeds.
A normal successful `communication.send` completion may update only execution evidence; it does not silently create broader recipient authority.

## Failure and replay behavior

A send task is single-attempt. Any worker crash, timeout, UI ambiguity, or post-send uncertainty is terminal/waiting evidence rather than an automatic retry.
Reusing the same task idempotency key resolves to the existing task and cannot silently execute the side effect twice.
No alternative worker or licensed provider may be used as a fallback for this capability.

## Testing and acceptance

Automated tests cover positive send, unsupported platform, broad/missing recipient, wrong recipient, wrong draft, missing/disabled native Send control, post-send verification failure, receipt redaction, single-attempt policy, manifest/readiness semantics, and duplicate idempotency.
The existing broad Teams-send planner rejection must remain green.
`git diff --check` and full `npm run verify` must pass on the exact implementation head, followed by exact-head Ubuntu and Windows Verify before merge.
A live attended Teams smoke send is optional acceptance evidence and must use a harmless owner-designated recipient/message; it is never run at startup or without an explicit owner objective.
## Readiness bootstrap detail

The manifest uses `capabilityCanaries["communication.send"] = "manual"`. Config validation accepts `manual`, and worker startup/readiness refresh skips manual canaries so no message is ever sent implicitly.
The router may bootstrap or refresh this one capability when readiness is otherwise healthy but the canary is `never` or `stale` only if the task is attended, has an authority-session binding, and `maximumAttempts === 1`. That explicit real task is the canary; no background process creates one.
After a verified `communication.send` completion, the supervisor records its exact completion receipt as fresh canary evidence for that capability. Failed or uncertain completions never promote readiness.

## Structured request envelope

Public structured task intake adds one `recipient` field for `communication.send`. The exact message remains `requestedOutcome`.
`policyTaskInput` converts only this capability into a bounded JSON execution envelope `{ recipient, message }` inside `requestedOutcome`; the existing task-content vault therefore protects both values together in live operation without adding plaintext recipient columns.
The desktop worker parses this fixed envelope and rejects unknown keys, empty values, broad recipient tokens, oversize values, or malformed JSON.
Other task types continue to receive their existing plain `requestedOutcome` behavior unchanged.
## Repair-governance boundary

Because this change makes src/desktop-worker.mjs write-capable, that file becomes an ESSENTIAL_FILES member and receives a byte-identical release-baseline mirror. The other modified essential source/manifest files refresh their existing baseline mirrors only after focused behavior is green.
