# Mahoraga Chromebook Control Plane

## Purpose

This control plane turns a storage-constrained ChromeOS device into a browser-only command surface for Mahoraga without installing Crostini/Linux, exposing the Windows host, or adding OpenAI API billing.

The Chromebook is intentionally a **thin control plane**. Execution stays in existing trusted lanes:

1. **GitHub-hosted deterministic orchestration** for validation, status, and queue creation.
2. **Windows Secondary Codex runner** for bounded local repository implementation using that machine's ChatGPT/Codex subscription authentication.
3. **Codex cloud** for bounded repository work through the existing GitHub bridge and ChatGPT sign-in.
4. **Mahoraga localhost runtime** remains on Windows and is never exposed to the public internet.

No `.deb`, `.rpm`, Crostini container, public tunnel, reverse proxy, or OpenAI API key is required on the Chromebook.

## Subscription policy

The OpenAI route is **ChatGPT Plus first**:

- Prefer deterministic/local/GitHub/Microsoft capabilities when they can complete the task.
- Use Codex authenticated with ChatGPT for AI repository work.
- Do not introduce `OPENAI_API_KEY` as an implicit fallback.
- API billing is opt-in only if the owner later chooses it.

The existing Secondary Codex runner already strips credential-like/API-key environment variables from Codex execution and expects the local Codex sign-in path. The existing Codex cloud bridge is likewise designed around ChatGPT sign-in rather than custom API billing.

## Browser-only workflow

After this workflow is on `main`, use Chrome on the Chromebook:

1. Open the Mahoraga repository on GitHub.
2. Open **Actions**.
3. Choose **Chromebook Control Plane**.
4. Select **Run workflow**.
5. Choose one mode:
   - `status` — show repository coordination state plus the zero-credit GitHub
     assurance dashboard.
   - `verify` — run Mahoraga's deterministic validation/test suite on GitHub-hosted compute.
   - `secondary-assignment` — create a bounded assignment for the registered Windows Secondary Codex runner.
   - `codex-cloud-task` — create a bounded Codex cloud task using the existing GitHub bridge.

The workflow accepts an immutable base commit, an explicit allowed-path list, and bounded task text. It does not accept arbitrary shell commands.

Every verification run also publishes a readable assurance table in the GitHub
Actions summary. It reports the versioned repository controls, SHA-pinning
state, and privacy boundary without invoking Codex or requiring the Windows host.

## One-time GitHub setting

The repository's GitHub Actions token must be able to commit the generated coordination record. In GitHub repository settings, set the workflow token to **Read and write permissions** if it is currently read-only.

This is not a ChatGPT/OpenAI API credential. It is GitHub's short-lived repository-scoped workflow token and is created by GitHub for the workflow run.

## Security properties

- The workflow refuses to run for anyone other than the repository owner.
- The repository is public, so the owner gate is mandatory.
- User input becomes validated Mahoraga coordination metadata, not an arbitrary command line.
- Secondary execution remains inside the existing `workspace-write --ephemeral` runner path.
- Actual Secondary changed paths remain enforced by the existing runner.
- Codex cloud work remains bounded by the existing task contract and GitHub issue/PR return path.
- No Windows listener is opened.
- No Chromebook-local daemon is required.
- No ChatGPT conversation is copied into GitHub.
- Core Mahoraga update activation remains an owner decision.

## Recommended Chromebook setup

Keep the device lightweight:

- Chrome as the primary shell.
- ChatGPT/Codex Chrome integration pinned.
- GitHub signed in with the owner account.
- Mahoraga repository bookmarked.
- GitHub Actions control-plane page bookmarked.
- Microsoft 365, Copilot Studio, Power Automate, and other cloud tools used as PWAs/tabs.
- Remote desktop used only when a visual Windows-only application must be operated directly.

Do not spend the Chromebook's limited internal storage on a Linux container.

## Task examples

### Secondary assignment

Use this when the Windows Secondary runner should perform the work.

- Mode: `secondary-assignment`
- Title: `Harden browser worker receipts`
- Task area: the task area already registered on the Windows runner for Mahoraga
- Task: `Improve bounded browser receipt validation and add focused tests.`
- Allowed paths: `src,test,docs`
- Base commit: leave blank to use current Mahoraga `main`

The workflow commits an immutable assignment record. The Windows runner polls GitHub outbound, executes with its own ChatGPT/Codex sign-in, enforces the path boundary, and returns its bounded branch/result.

### Codex cloud task

Use this when repository-only work can run in Codex cloud.

- Mode: `codex-cloud-task`
- Title: `Add focused coordination tests`
- Task: `Add regression coverage for the Chromebook control-plane coordination path.`
- Allowed paths: `test,docs`
- Verification: `npm run verify`
- Integration mode: `pull-request`

The workflow commits the validated cloud-task record. The existing dispatch workflow converts it into the bounded GitHub/Codex queue. Codex cloud uses ChatGPT sign-in rather than an OpenAI API key.

## Boundaries that remain intentional

This control plane does not pretend the Chromebook can reach `127.0.0.1:4782` on the Windows machine. Localhost remains local. Portable runtime health can be added later as a **sanitized outbound heartbeat** from Windows to GitHub or another approved cloud queue; it should not be implemented by exposing the Mahoraga control server.

Likewise, Windows desktop control should continue through the planned/approved Mahoraga Desktop Worker or an attended remote-desktop session. The Chromebook control plane is the orchestrator, not a replacement Windows host.
