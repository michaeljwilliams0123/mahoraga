# GitLab Ephemeral CLI Execution Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Extend GitLab project \`85885826\` into a zero-incremental-cost broker that accepts a validated Mahoraga task, mints a short-lived GitHub App installation token, runs full Bash only inside an ephemeral CI job, pushes a candidate branch, opens a PR, and emits digest-only evidence.

**Architecture:** GitLab remains an independent execution and assurance plane; GitHub remains authoritative. A pipeline receives either a one-time Cloudflare task lease or a bounded base64 task envelope from an explicitly approved ChatGPT/GitLab dispatch. The runner validates before cloning, obtains a short-lived installation token in memory, executes in a disposable worktree, verifies, pushes only \`feature/cloud-cli-*\`, opens a PR, and never merges or writes to \`main\`.

**Tech Stack:** GitLab CI, Node.js 24 ESM, Bash 5, Git, GitHub REST API, GitHub App JWT/installation tokens, node:test.

**Spec:** [2026-09-07-cloud-cli-memory-broker-design.md](../specs/2026-09-07-cloud-cli-memory-broker-design.md)

**Global Constraints:**

- Make implementation changes in GitLab project \`85885826\`; store no GitLab secrets in GitHub.
- Use GitHub App credentials, not a long-lived PAT, for candidate branch and PR writes.
- Restrict credential-bearing jobs to protected GitLab \`main\` and environment \`github-execution\`.
- Never push, merge, force-push, delete, or retarget GitHub \`main\`.
- Full shell is temporary and isolated: \`bash --noprofile --norc -euo pipefail\`, clean environment allowlist, disposable checkout, bounded timeout, no host mounts, no Docker socket, no privileged runner.
- Do not echo the task envelope, command, token, environment, stdout, stderr, prompts, or conversation content into logs or artifacts.
- Artifacts contain only sanitized receipts and digests, and every stage verifies the predecessor digest.
- Physical concurrency starts at 2; GitLab runner/quota exhaustion returns \`waiting\`, never a paid runner fallback.
- Existing GitHub health and repair jobs remain intact.

## Task 1: Vendor and verify the authoritative task contract

**GitLab files:**
- Create: \`contracts/cloud-cli-task.schema.json\`
- Create: \`scripts/cloud-cli-task-contract.mjs\`
- Create: \`test/cloud-cli-task-contract.test.mjs\`
- Modify: \`test/pipeline-contract.test.mjs\`

- [ ] Copy the released schema and dependency-free validator from the exact GitHub commit produced by the contracts plan. Record its GitHub blob SHA in \`contracts/UPSTREAM.json\`.
- [ ] Write tests that reject any schema/blob mismatch, caller-selected provider, invalid repository, non-exact base commit, unsafe path, unknown field, secret-shaped text, and payload over 64 KiB after base64 decoding.
- [ ] Add \`readTaskIntake({ env, fetchImpl })\` with two mutually exclusive inputs:
  - \`MAHORAGA_TASK_ID\` plus \`MAHORAGA_TASK_LEASE_TOKEN\` for Cloudflare lease retrieval.
  - \`MAHORAGA_TASK_ENVELOPE_B64\` for an explicitly approved direct ChatGPT-to-GitLab API pipeline.
- [ ] Reject zero or two intake modes. Decode in memory, validate immediately, and return a frozen envelope. Never print it.
- [ ] Run \`node --test test/cloud-cli-task-contract.test.mjs test/pipeline-contract.test.mjs\`.
- [ ] Commit in GitLab with \`git commit -m "feat: validate cloud cli task intake"\`.

## Task 2: Mint short-lived GitHub App installation tokens

**GitLab files:**
- Create: \`scripts/github-app-auth.mjs\`
- Create: \`test/github-app-auth.test.mjs\`
- Modify: \`.gitlab-ci.yml\`
- Modify: \`README.md\`

- [ ] Write failing unit tests with a fake clock and fetch implementation. Assert JWT \`iat\` is 60 seconds in the past, \`exp\` is no more than 9 minutes ahead, \`iss\` equals the configured App ID, the installation-token endpoint is fixed, and token/error bodies never enter thrown messages.
- [ ] Implement:

\`\`\`js
createGitHubAppJwt({ appId, privateKeyPem, now })
mintInstallationToken({
  appId,
  installationId,
  privateKeyPem,
  repository: "michaeljwilliams0123/mahoraga",
  fetchImpl,
  now,
})
\`\`\`

Request only \`contents:write\`, \`pull_requests:write\`, \`actions:read\`, \`checks:read\`, and metadata read as granted by the App. Return \`{token, expiresAt, permissionsDigest}\` in memory.

- [ ] Configure protected, masked GitLab variables scoped to \`github-execution\`: \`GITHUB_APP_ID\`, \`GITHUB_APP_INSTALLATION_ID\`, and \`GITHUB_APP_PRIVATE_KEY_B64\`. The setup documentation must instruct decoding only in process memory.
- [ ] Add a protected-main credential-readiness job that checks presence without printing values.
- [ ] Run the unit tests and the GitLab pipeline contract test.
- [ ] Commit with \`git commit -m "feat: use short lived github app auth"\`.

## Task 3: Build the isolated shell runner

**GitLab files:**
- Create: \`scripts/cloud-cli-execute.mjs\`
- Create: \`scripts/cloud-cli-shell.sh\`
- Create: \`test/cloud-cli-execute.test.mjs\`
- Create: \`test/cloud-cli-shell.test.mjs\`
- Modify: \`.gitlab-ci.yml\`

- [ ] Write failing tests that prove:
  - branch names are exactly \`feature/cloud-cli-<task-id suffix>-<attempt>\`;
  - base checkout equals \`task.baseCommit\`;
  - changed files stay within \`allowedPaths\`;
  - \`.git\`, protected roots, symlinks escaping the checkout, and submodule changes are rejected;
  - timeout, cancellation, quota exhaustion, and non-zero verification have distinct failure codes;
  - the runner never invokes \`sudo\`, Docker, host mounts, SSH agents, or an interactive shell.

- [ ] Implement \`scripts/cloud-cli-shell.sh\` with this boundary:

\`\`\`bash
#!/usr/bin/env bash
set -euo pipefail
exec env -i \
  PATH="/usr/local/bin:/usr/bin:/bin" \
  HOME="$CI_PROJECT_DIR/.ephemeral-home" \
  LANG="C.UTF-8" \
  MAHORAGA_TASK_FILE="$MAHORAGA_TASK_FILE" \
  timeout --signal=TERM --kill-after=15s "$MAHORAGA_TIMEOUT_SECONDS" \
  bash --noprofile --norc -euo pipefail "$MAHORAGA_COMMAND_FILE"
\`\`\`

The orchestrator writes the command to a mode-0700 temporary directory, passes no credential variables to the shell, and deletes the directory in a \`finally\` block.

- [ ] Before execution, clone with the installation token through an askpass helper held in the temporary directory. Immediately unset the token after fetch/push API operations.
- [ ] After execution, run \`npm ci\` and the manifest-defined \`npm run verify\` outside the raw command but inside the same disposable job.
- [ ] Compute \`changedPaths\`, \`headCommit\`, verification digest, policy digest, and sanitized failure code. Do not persist command output.
- [ ] Run focused tests, then run the job once against a fixture repository with no network.
- [ ] Commit with \`git commit -m "feat: add ephemeral cloud cli shell runner"\`.

## Task 4: Push the candidate branch and create a PR without merging

**GitLab files:**
- Create: \`scripts/github-candidate-publish.mjs\`
- Create: \`test/github-candidate-publish.test.mjs\`
- Modify: \`.gitlab-ci.yml\`

- [ ] Write failing tests for idempotent branch publication and PR creation. Reject forks, alternate repositories, alternate bases, branch deletion, force flags, direct-main refs, draft=false, and any review API call.
- [ ] Implement:

\`\`\`js
publishCandidate({
  task,
  headCommit,
  branch,
  installationToken,
  fetchImpl,
})
\`\`\`

Use \`git push --porcelain origin HEAD:refs/heads/<branch>\` without \`--force\`. Create or reuse one draft PR targeting \`main\` with title \`[CLOUD-CLI] <taskId>: <bounded objective summary>\`. The body contains only task ID, base/head SHA, changed paths, verification digest, and receipt digest.

- [ ] If the task changes a protected path from the authoritative policy snapshot, add \`manual-bootstrap-required\` to the receipt and leave the PR draft. Otherwise mark ready-for-verification; do not approve, review, comment, react, or merge.
- [ ] Run focused tests and a dry-run fixture test.
- [ ] Commit with \`git commit -m "feat: publish verified cloud cli candidates"\`.

## Task 5: Add digest-chained artifacts and broker callbacks

**GitLab files:**
- Create: \`scripts/cloud-cli-receipt.mjs\`
- Create: \`scripts/cloud-cli-callback.mjs\`
- Create: \`test/cloud-cli-receipt.test.mjs\`
- Create: \`test/cloud-cli-callback.test.mjs\`
- Modify: \`.gitlab-ci.yml\`
- Modify: \`README.md\`

- [ ] Write failing tests for canonical JSON, predecessor digest validation, receipt redaction, retry idempotency, callback authentication, and terminal-state conflicts.
- [ ] Implement artifact chain:
  \`intake-receipt.json -> execution-receipt.json -> publish-receipt.json\`.
  Each record includes \`schemaVersion\`, \`taskId\`, \`attempt\`, \`observedAt\`, \`predecessorDigest\`, \`payloadDigest\`, and bounded evidence. No raw command output is allowed.
- [ ] Sign callback bodies with HMAC-SHA256 using protected \`BROKER_CALLBACK_SECRET\`; include timestamp, nonce, task ID, state, receipt digest, and pipeline ID.
- [ ] Configure GitLab artifacts with short expiry and \`when: always\`. Configure only receipt JSON files—never the checkout, command file, environment, or logs.
- [ ] Update the pipeline stages to \`contract -> intake -> execute -> publish -> callback -> assurance\`, preserving current assurance/repair behavior.
- [ ] Set \`resource_group: github-cloud-cli-write\` for publication and project-level concurrency 2. When no free runner is available, the task remains queued; no alternate paid runner tag may be selected.
- [ ] Run \`node --test test/*.test.mjs\` and a protected-main pipeline with a deterministic documentation-only fixture.
- [ ] Commit with \`git commit -m "feat: chain cloud cli execution receipts"\`.

## Task 6: Exercise kill and recovery paths

**GitLab files:**
- Create: \`test/cloud-cli-e2e.test.mjs\`
- Modify: \`README.md\`

- [ ] Add an end-to-end fake-GitHub test that covers validated intake, short-lived auth, exact-base clone, shell success, verification, branch push, draft PR, callback, and digest chain.
- [ ] Add failure tests for revoked App installation, expired task lease, base moved, cancellation before shell, cancellation during shell, failed verification, protected-root change, GitHub 409/422, and replayed callback.
- [ ] Document emergency stop: set GitHub broker kill switch, cancel GitLab pipeline, revoke GitHub App installation, and rotate callback/trigger secrets. No cleanup step may delete a GitHub branch automatically.
- [ ] Run all GitLab tests and retain only sanitized receipt artifacts.
- [ ] Commit with \`git commit -m "test: verify cloud cli execution kill paths"\`.

## Completion Gate

- [ ] GitLab test suite and a protected-main canary pipeline pass.
- [ ] GitHub App installation token lifetime is short and its value is absent from logs/artifacts.
- [ ] Full shell receives no GitHub, GitLab, Cloudflare, or Business credential.
- [ ] No code path can push or merge \`main\`, force-push, delete refs, call review APIs, or choose a paid runner.
- [ ] GitHub receives one draft candidate PR at an exact verified head; automatic landing remains entirely on GitHub.
