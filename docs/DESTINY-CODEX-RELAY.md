# Destiny Codex event relay

This relay lets Michael's authenticated Primary Codex call the separately
authenticated Destiny Codex through the private GitHub repository. It is an
event-driven, near-real-time handoff: GitHub emits the pull-request event and
ChatGPT starts the configured Codex task without an inbound tunnel or a polling
model call. Delivery still depends on GitHub and ChatGPT availability, so it is
not an instantaneous or exactly-once transport guarantee.

The relay shares repository task metadata only. It does not transfer ChatGPT
authentication, subscription credits, chat history, memories, email, personal
files, browser history, credentials, or plugin output. Each Codex runs under
the account that received the event. Destiny's conversations remain outside the
repository and outside Mahoraga.

## Trigger contract

A valid dispatch pull request has all of these properties:

- The author and repository owner are exactly `michaeljwilliams0123`.
- The base branch is `main`.
- The title is exactly `[DESTINY-CODEX] <envelope title>`.
- The diff contains exactly one newly added immutable JSON envelope at
  `coordination/destiny-dispatches/<dispatch-id>.json`; existing envelopes are
  append-only and cannot be edited, renamed, or deleted.
- The envelope binds its deterministic dispatch ID, idempotency key, repository,
  current `main` base tip and merge base, target controllers, task, allowed paths, fixed verification
  profile, retry ceiling, privacy declaration, and SHA-256 request hash.
- Implementation changes, if present, are confined to `allowedPaths`. The
  validator, relay workflow, and dispatch registry are protected paths.

The pull-request workflow checks out `main` and the candidate into separate
directories. It executes only the validator from trusted `main`, with read-only
GitHub permissions. A candidate therefore cannot weaken its own gate.

## Create a dispatch from Primary

Start a branch directly from the current `main`, then capture that full commit
SHA as the immutable base. Create the envelope with a unique semantic
idempotency key:

```powershell
git switch main
git pull --ff-only
git switch -c destiny/connection-probe
$base = git rev-parse HEAD
node scripts/destiny-codex-dispatch.mjs create `
  --idempotency-key "owner-20260826-connection-probe" `
  --base-commit $base `
  --title "Verify Destiny relay" `
  --task "Return a bounded connection receipt; do not change implementation files." `
  --allowed-paths "docs/relay-probes"
npm run destiny:validate
git add coordination/destiny-dispatches
git commit -m "[PRIMARY] Dispatch Destiny connection probe"
git push -u origin destiny/connection-probe
```

Open a pull request to `main` with the exact title:

```text
[DESTINY-CODEX] Verify Destiny relay
```

The task text is data, never an executable shell command. Verification is an
allowlist of identifiers (`manifest`, `coordination`, `github-audit`, and
`tests`) mapped to repository-owned commands. Callers cannot submit arbitrary
executables through the envelope.

## Receipts and idempotency

Treat the handoff as connected only when both signals exist:

1. **Destiny relay envelope** passes in GitHub Actions. This proves the trusted
   repository contract accepted the PR.
2. A matching `[DESTINY-CODEX:ACK]` comment appears. This proves the
   Destiny-authenticated event task received the dispatch.

The Destiny task uses bounded comment markers:

- `[DESTINY-CODEX:ACK]` — accepted dispatch ID and short request hash.
- `[DESTINY-CODEX:RESULT]` — bounded repository result and verification state.
- `[DESTINY-CODEX:REJECTED]` — contract rejection without private content.

Repeated opened, synchronize, comment, commit, or review events for an existing
dispatch ID and request hash must not execute the work again. Marker comments
created by the task are ignored so the automation cannot trigger itself. Reusing
an idempotency key with changed task data produces an idempotency conflict.

## Lane selection

| Lane | Trigger | Recipient | Delivery proof |
| --- | --- | --- | --- |
| Destiny Codex | `[DESTINY-CODEX]` owner PR | This separately authenticated ChatGPT/Codex account | Matching ACK comment |
| Codex cloud | Validated `@codex` PR comment | Connected general Codex cloud service | Cloud task/PR response |
| Secondary desktop | Assignment on `main` | Outbound Windows poller and local Codex auth | Result record and return branch |

These lanes coordinate through GitHub but do not share credentials or quota.
Normal deterministic Actions, mailbox validation, and idle polling do not invoke
a model. Only an explicit accepted model trigger starts model work.

## Failure handling

- Validation failure: correct the envelope generator input; never hand-edit the
  hash or weaken the workflow.
- No ACK after a green validation check: inspect the ChatGPT GitHub event task
  connection and event history. Do not repeatedly mutate the PR, because each
  event can create another delivery attempt.
- Stale base: rebase onto current `main` and create a new idempotency key and
  envelope. The old envelope is immutable evidence.
- Rejection or blocked result: retain the bounded receipt and let a Primary
  decide whether to issue a new dispatch.

The relay never changes repository visibility, merges a pull request, bypasses
checks, installs an update, or activates a release. Integration remains governed
by the single Primary integration lease and the repository's normal review path.
