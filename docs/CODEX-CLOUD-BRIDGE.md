# Codex cloud bridge

The bridge lets the local Primary Codex delegate repository work through the
GitHub App while keeping Mahoraga private and preserving the existing privacy
boundary. GitHub issues and pull requests are the durable queue; Codex cloud is
the bounded implementation worker.

This is intentionally not a custom OpenAI API integration. Codex cloud requires
ChatGPT sign-in and can start work from GitHub issues and pull requests. Using an
OpenAI API key would use separate API billing instead of included ChatGPT plan
usage. See the official OpenAI documentation for [Codex cloud](https://learn.chatgpt.com/docs/cloud),
[authentication](https://learn.chatgpt.com/docs/auth), and the
[GitHub integration](https://learn.chatgpt.com/docs/third-party/github).

## Ownership and data boundary

- The local Primary Codex normally coordinates tasks and uses its connected
  plugins, but all user-authorized Codex instances may edit, review, and merge
  verified work from either direction.
- Codex cloud receives only the validated task issue and repository contents.
- ChatGPT conversations, personal files, browser history, credentials, tokens,
  raw plugin responses, and unrelated context never enter GitHub.
- If a plugin is needed, Primary performs that action locally and reduces the
  result to sanitized task metadata or repository evidence before delegation.
- Codex cloud preserves a pull-request audit trail. It may merge after declared
  verification only when the task explicitly uses `merge-after-verify`.

## Private-repository setup

Before changing Mahoraga to private:

1. In Codex cloud settings, connect GitHub and explicitly grant the Codex GitHub
   App access to `michaeljwilliams0123/mahoraga`.
2. Create a Codex cloud environment for the repository and use `main` as its
   base branch.
3. Keep secrets out of the repository. Environment secrets, if ever needed,
   belong in the Codex cloud environment and are available only during setup.
4. Test the connection by creating a bounded issue containing `@codex`. A
   healthy integration acknowledges the mention and returns a branch or PR.
5. After the private connection is confirmed, remove temporary public access
   and revoke any bootstrap-only public-repository credential.

GitHub Desktop authenticates the Windows checkout, but it is distinct from the
Codex cloud GitHub App connection. Both may use the same repository without
sharing ChatGPT conversations.

## Task lifecycle

1. Primary creates a strict task record on `main`. Use a stable idempotency key
   for retries of the same logical work:

   ```powershell
   node .\scripts\codex-cloud-task.mjs create `
     --idempotency-key "mahoraga-feature-v1" `
     --base-commit "<full-main-commit>" `
     --title "Implement the bounded feature" `
     --task "Implement the repository-only change and return a pull request." `
     --allowed-paths "src,test,docs" `
     --verification "npm run verify"
   ```

   Commit the generated `coordination/cloud-tasks/<task-id>.json` file to
   `main`. The `codex-cloud-dispatch.yml` workflow validates every queued record,
   reconciles it against all existing issues by task ID and idempotency key, and
   creates the `@codex` issue with GitHub's repository-scoped workflow token.
   No GitHub token or OpenAI API key is stored on either Windows computer.

2. Primary can validate and render any task locally before commit:

   ```powershell
   node .\scripts\codex-cloud-task.mjs validate --file .\task.json
   node .\scripts\codex-cloud-task.mjs render --file .\task.json
   ```

3. GitHub Actions creates missing bridge labels, searches open and closed issues
   for the exact rendered marker, and reuses an existing issue on reruns.
4. If no issue exists, GitHub creates it with `codex:queued` and
   `privacy:repo-only`. The body begins with `@codex`, which starts the connected
   Codex cloud task.
5. Codex cloud works from the immutable base commit and opens a PR. An authorized
   Codex changes the issue label to `codex:review`, checks the actual diff and
   tests, and either requests a follow-up or merges according to `integrationMode`.
6. Primary records only bounded return evidence and changes the issue to
   `codex:done`. Failures use `codex:blocked`; attempts remain bounded.

Recommended state labels are `codex:queued`, `codex:running`, `codex:review`,
`codex:blocked`, `codex:done`, and `privacy:repo-only`.

## API responsibility split

| Operation | Owner | Interface |
| --- | --- | --- |
| Validate and render task | Mahoraga | Local deterministic Node command |
| Search/create issue | GitHub Actions | Repository-scoped `GITHUB_TOKEN` |
| Start implementation | GitHub | `@codex` issue or PR mention |
| Execute repository work | Codex cloud | Isolated connected environment |
| Return changes | Codex cloud | Pull request |
| Inspect, approve, merge | Authorized Codex instance | Connected GitHub App and local tests |

There is no inbound listener on the Windows machine and no credential in task
JSON. The main machine and secondary runner poll or receive GitHub events
outbound through their own authenticated connections.
