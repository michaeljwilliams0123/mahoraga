# GitHub coordination for separate Codex instances

GitHub is the only shared coordination surface. Local and cloud Primary Codex
are equal controllers: either may architect, decompose, create bounded
assignments, implement, test, review, and integrate. Integration to `main`
requires a single, time-bounded integration lease held by one primary at a time;
it is never an auto-merge grant. Secondary Codex implements scoped repository work only and
returns it on `secondary/<assignment-id>`; it never pushes or merges `main`.
No instance reads or exports another instance's ChatGPT conversations.

The version 1 mailbox keeps `main-codex` to `secondary-codex` role fields and a
`secondary/<assignment-id>` return branch as an enforced authority boundary.
Either primary creates and reviews assignments; Secondary implements them within
the declared paths. A primary holding the integration lease alone integrates a
validated return. Concurrent implementation paths may overlap, but controllers
must surface and coordinate the overlap before integration.

## Privacy boundary

Versioned coordination records may contain only task metadata, repository paths,
commit identifiers, verification commands, and concise results. They must not
contain chat transcripts, conversation exports, credentials, browser history,
personal files, or unrelated user context. In particular, Destiny's chats are
outside this system and are never an input to the mailbox.

Secrets remain outside Git in the platform or operating-system secret store.
An Alpic deployment key, GitHub credential, relay token, or local bearer token
must never appear in an assignment, result, commit message, or issue.

## Control Center visibility

The localhost Control Center exposes a read-only, minimized Coordination view
backed by the durable assignment table. It shows the mailbox lifecycle (`READY`,
return detected, validating, `VALIDATED`, or `REJECTED`), assignment ID, task
area, declared return branch, timestamps, and verification state. Full task text,
allowed paths, commit identifiers, correlations, credentials, ChatGPT
conversations, browser data, personal files, and model output are not returned.
Assignment creation and controller intake remain behind the existing
authenticated API and repository workflow.

## Equal primary controller workflow

The controller identities are `primary-local-codex` and
`primary-cloud-codex`; the location label is transport, not an authority tier.
Both use the same bounded task record, repository evidence, verification gates,
privacy rules, and verified local automatic core-update activation with rollback. Before updating
`main`, a controller must acquire the single integration lease, confirm it has
not expired, revalidate the candidate and overlapping paths, and release it
after the update. The lease coordinates integration; it does not authorize a
merge, bypass review, change visibility, or activate a release.

The running control plane persists the lease in SQLite. Its bounded holder,
paths, and expiry appear in `GET /api/coordination`. Either equal Primary uses
the authenticated loopback endpoints below with the existing Primary Codex
session token; a second holder receives HTTP 409 plus visible overlap evidence:

- `POST /api/coordination/integration-lease/acquire`
- `POST /api/coordination/integration-lease/release`

1. Start from the code commit the secondary implementation must retain. That
   commit becomes the assignment's immutable `expectedBaseCommit`.
2. Create the assignment:

   ```powershell
   node scripts/coordination.mjs create-assignment `
     --title "Focused repository change" `
     --task-area "provider-adapter" `
     --task "Implement the scoped change and its focused tests." `
     --allowed-paths "src,test,docs"
   ```

3. Review `coordination/assignments/<assignment-id>.json` to ensure it contains
   no private conversation content, then commit and push it to `main`. This
   small mailbox commit will naturally be newer than `expectedBaseCommit`.
   The local supervisor imports the validated record into its durable assignment
   table idempotently before it polls for the return branch.
4. Give the implementing instance only the assignment ID and repository URL.
5. Wait for `secondary/<assignment-id>`. Verify the returned commit against the
   assignment's `expectedBaseCommit`, allowed paths, and test evidence before
   merging. The existing Repository Worker performs ancestry, manifest, and
   `git diff --check` validation without checking out the branch.

## Secondary implementation workflow

1. Fetch `main` and read only `coordination/assignments/<assignment-id>.json` plus
   repository files needed for the assignment.
2. Create `secondary/<assignment-id>` from the `main` commit containing that
   assignment. Confirm that `expectedBaseCommit` is an ancestor of the branch;
   do not start from an unrelated or older history line.
3. Change only `allowedPaths`, run focused verification, and commit with the
   attribution prefix for the controller that performed the work.
4. Commit the implementation, then record the result on the return branch. The
   result's `returnCommit` identifies that implementation commit; the later
   metadata-only result commit may become the branch head.

   ```powershell
   node scripts/coordination.mjs complete-assignment `
     --id "<assignment-id>" `
     --status "completed" `
     --summary "Implemented and verified the scoped change." `
     --changed-files "src/example.mjs,test/example.test.mjs" `
     --verification "node --test --test-isolation=none"
   ```

5. Commit the result record and push only `secondary/<assignment-id>`. The one
   matching `coordination/results/<assignment-id>.json` file is protocol
   metadata and is permitted in addition to the assignment's `allowedPaths`.
   Do not push directly to `main`.

If blocked, use `--status blocked`; a return commit is not required. The result
must explain the repository-level blocker without copying a chat transcript.

## Codex cloud lane

For background work that should use the ChatGPT-linked Codex cloud service,
Primary Codex may instead prepare a validated pull request and place the
`@codex` task in a pull-request comment.
That lane returns a pull request rather than a `secondary/<assignment-id>` branch
and remains subject to the same repository-only privacy boundary. When a
validated task designates it `primary-cloud-codex`, it has the same controller
capabilities as local Primary; otherwise it remains a bounded execution or
review lane. Integration still requires the single lease and deterministic
verification. See
[`CODEX-CLOUD-BRIDGE.md`](CODEX-CLOUD-BRIDGE.md) for the contract, idempotency
marker, connected-repository setup, and reciprocal review workflow.

## Destiny Codex event lane

The Destiny-authenticated Codex is a distinct event-driven Primary lane. An
owner-authored pull request with the exact `[DESTINY-CODEX] <envelope title>`
title wakes the connected ChatGPT automation. A trusted-base workflow validates
the single hash-bound dispatch envelope, immutable merge base, allowed paths,
fixed verification identifiers, and repository-only privacy declaration. A
matching `[DESTINY-CODEX:ACK]` comment is the delivery receipt; the validation
check alone does not prove that the event reached the model-backed task.

This event lane neither polls the Windows computer nor opens an inbound tunnel.
It does not transfer authentication, subscription credits, conversations, or
personal context between accounts. Repeated events for an acknowledged dispatch
ID and request hash are idempotent and must not execute the task again. See
[`DESTINY-CODEX-RELAY.md`](DESTINY-CODEX-RELAY.md) for the exact trigger and
failure contract.

## Validation

Run `npm run coordination:validate` before every push. `npm run verify` and the
versioned pre-push hook also validate the mailbox. Return validation reads the
result directly from the remote branch, binds its implementation commit to the
branch head, and compares its claimed files with the actual Git diff. A result
fails validation if it has no assignment, changes a path outside the assignment
scope, conceals or fabricates a changed file, adds an undeclared field, changes
its assignment record, or weakens the explicit privacy declaration.

## Credit and request discipline

The Windows scheduled task may check the Git mailbox frequently, but an idle
poll performs Git metadata work only and does not invoke or even health-check the
Codex CLI. A newly observed assignment receives one model attempt. If that
attempt fails, the assignment stays paused until an operator deliberately runs
`node scripts/secondary-codex-runner.mjs retry --id <sec-id>`; the configured
`maxAttempts` ceiling still applies across those explicit retries.

A local single-flight lock rejects overlapping scheduled or manual polls, so two
processes on the same machine cannot spend credits on the same assignment. The
attempt is durably marked `running` before Codex starts; a process crash therefore
pauses the assignment instead of automatically spending another attempt. Task
IDs, return branches, cloud-task idempotency keys, and existing-issue reuse remain
the cross-run deduplication boundary. These controls do not transfer subscription
credentials or credits between Codex instances; each model execution uses only
the authenticated instance that accepted the bounded task.
