# GitHub coordination for separate Codex instances

GitHub is the only shared coordination surface. The main Codex creates bounded
assignment records and the secondary Codex returns an ordinary branch and commit.
Neither instance reads or exports the other instance's ChatGPT conversations.

## Privacy boundary

Versioned coordination records may contain only task metadata, repository paths,
commit identifiers, verification commands, and concise results. They must not
contain chat transcripts, conversation exports, credentials, browser history,
personal files, or unrelated user context. In particular, Destiny's chats are
outside this system and are never an input to the mailbox.

Secrets remain outside Git in the platform or operating-system secret store.
An Alpic deployment key, GitHub credential, relay token, or local bearer token
must never appear in an assignment, result, commit message, or issue.

## Main Codex workflow

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
4. Give the secondary instance only the assignment ID and repository URL.
5. Wait for `secondary/<assignment-id>`. Verify the returned commit against the
   assignment's `expectedBaseCommit`, allowed paths, and test evidence before
   merging. The existing Repository Worker performs ancestry, manifest, and
   `git diff --check` validation without checking out the branch.

## Secondary Codex workflow

1. Fetch `main` and read only `coordination/assignments/<assignment-id>.json` plus
   repository files needed for the assignment.
2. Create `secondary/<assignment-id>` from the `main` commit containing that
   assignment. Confirm that `expectedBaseCommit` is an ancestor of the branch;
   do not start from an unrelated or older history line.
3. Change only `allowedPaths`, run focused verification, and commit with a
   `[SECONDARY]` prefix.
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

For background work that should use the ChatGPT-linked Codex cloud service, the
Primary Codex may instead create a validated GitHub issue containing `@codex`.
That lane returns a pull request rather than a `secondary/<assignment-id>` branch
and remains subject to the same repository-only privacy boundary. Either
user-authorized Codex instance may merge verified work when the task explicitly
uses `merge-after-verify`. See
[`CODEX-CLOUD-BRIDGE.md`](CODEX-CLOUD-BRIDGE.md) for the contract, idempotency
marker, private-repository setup, and Primary review workflow.

## Validation

Run `npm run coordination:validate` before every push. `npm run verify` and the
versioned pre-push hook also validate the mailbox. Return validation reads the
result directly from the remote branch, binds its implementation commit to the
branch head, and compares its claimed files with the actual Git diff. A result
fails validation if it has no assignment, changes a path outside the assignment
scope, conceals or fabricates a changed file, adds an undeclared field, changes
its assignment record, or weakens the explicit privacy declaration.
