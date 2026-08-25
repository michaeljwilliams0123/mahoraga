# GitHub coordination for separate Codex instances

GitHub is the only shared coordination surface. Primary Codex creates bounded
assignments on `main`, owns architecture and integration, validates returns,
and performs merges. Secondary Codex implements scoped repository work only and
returns it on `secondary/<assignment-id>`; it never pushes or merges `main`.
No instance reads or exports another instance's ChatGPT conversations.

The version 1 mailbox keeps `main-codex` to `secondary-codex` role fields and a
`secondary/<assignment-id>` return branch as an enforced authority boundary.
Primary creates and reviews assignments; Secondary implements them within the
declared paths. Primary alone integrates a validated return.

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

## Primary controller workflow

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
and remains subject to the same repository-only privacy boundary. Primary Codex
reviews and integrates verified work after the declared verification passes. See
[`CODEX-CLOUD-BRIDGE.md`](CODEX-CLOUD-BRIDGE.md) for the contract, idempotency
marker, connected-repository setup, and reciprocal review workflow.

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
