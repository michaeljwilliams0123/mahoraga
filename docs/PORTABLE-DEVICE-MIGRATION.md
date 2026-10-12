# Portable Mahoraga execution and device migration

## What persists when you change machines

- GitHub protected `main` is source authority. Cloudflare owns the separately accepted cloud runtime, UI and durable state. Neither belongs to a particular PC.
- The Sovereign candidate and producer-smoke workflows request **self-hosted + Windows + x64 + mahoraga + zero-credit**, not **SD009WC7**. Any authorized and eligible replacement Windows computer can take queued device-required jobs.
- If all compatible machines disappear, those jobs **remain queued**, rather than silently buying cloud runners, invoking a paid model, or treating missing local work as completed.
- Existing public-repository Steward runs remain on **free standard GitHub-hosted Ubuntu**. The current Steward job intentionally skips when the repository is private; this PR **does not claim a private Steward fallback** or an unlimited free-hosted-compute entitlement. Other private-repository workflows require their own budget gates.
- SD009WC7 remains a useful reference lab in the operating doctrine, but not a mandatory production runner or source authority.

## Replacement Windows x64 PC: one owner-initiated enrollment command

Prerequisites: a trusted copy of the repository, Node.js **24+**, Git and **Git Bash on PATH**, GitHub CLI `gh` authenticated with repository **owner/admin** access, and elevated PowerShell. GitHub recommends installing its runner in a drive-root directory for Windows service account compatibility.

1. On the replacement machine, retrieve and inspect the canonical source:

   ```powershell
   gh repo clone michaeljwilliams0123/mahoraga
   cd mahoraga
   git switch main
   git pull --ff-only
   pwsh -NoProfile -File scripts/portable-runner-enroll.ps1 -Mode Inspect
   ```

2. When the repo is **private**, open an **administrator PowerShell** in that trusted directory, then run:

   ```powershell
   pwsh -NoProfile -File scripts/portable-runner-enroll.ps1 -Mode Enroll
   ```

   **Inspect** never downloads software, fetches tokens, or changes runner registrations. **Enroll** uses the official, pinned GitHub Actions runner **v2.337.0**, verifies its official SHA-256 digest, fetches a short-lived registration token just-in-time through your existing `gh` account, assigns a unique device name and common **mahoraga,zero-credit** labels, and requests a Windows service.

   New enrollment **refuses a public repository**. GitHub warns that public-repository pull requests can run untrusted code on self-hosted machines. Do **not** weaken that check to enable a new desktop while the repo is public; the currently healthy Steward cloud route is independent of a desktop.

   Default runner files go under `%SystemDrive%\mahoraga-actions-runner`. Optional `-RunnerDirectory` must be a new, absolute **local** folder. Enrollment never overwrites a previous installation, copies `.runner` or `.credentials`, silently changes GitHub visibility, replaces another runner, or copies browser/Codex/OpenAI authentication.

3. In GitHub **Settings → Actions → Runners**, confirm the new runner is **online** with standard `self-hosted`, `Windows`, `X64` and custom `mahoraga`, `zero-credit` labels. Verify its service and perform an owner-approved, trusted-main job with precise result receipts before claiming a replacement device has been accepted.

4. Leave the old runner online until in-flight jobs settle, then retire it through GitHub's supported runner-removal and Windows service procedures. A lost computer's incomplete work must be reconciled by task ID and durable receipts, never copied over or automatically repeated.

## Optional Linux and macOS enrollment

On a trusted Linux/macOS computer with Node 24+, Git, `gh`, Bash, curl, and tar:

```bash
bash scripts/portable-runner-enroll.sh inspect
# After the repository becomes private and the owner is authenticated:
bash scripts/portable-runner-enroll.sh enroll
```

The script verifies official per-OS/per-architecture runner digests, registers a unique identity and starts the supported service. **Linux requires preconfigured noninteractive sudo** for this explicit one-command service install; macOS uses its native runner service script. It does not reclassify Linux or macOS hardware as Windows x64. Supporting the sovereign Windows jobs on other OSes is a separate tested implementation, not an asserted capability of this tranche.

## Security, offline recovery and cost boundary

- A workstation is **optional execution capacity**, never source or deployment authority. GitHub schedules only to compatible labels; losing a host cannot promote its stale receipts or override protected Verify.
- The existing self-hosted Windows runner currently provides these labels, so this update does not take it offline or rotate its credentials. **Do not run new-machine Enroll against the currently public repo.**
- Enroll is an explicit local owner action; the runner's generated credential stays local. A short-lived GitHub token is used only by GitHub's runner configuration program. Neither Cloudflare credentials nor private user data are used.
- An offline workstation does not cause a metered fallback. Private repositories have plan-dependent hosted allowances, so zero-dollar private hosting is **not guaranteed**. Work needing a device waits for an authorized eligible device; accepted cloud tasks continue independently.
- The source changes are safe to land separately from any device registration. They do not prove new-machine execution. To claim an actual migration, inspect a fresh runner inventory and verify a real trusted-main job on the replacement PC.

## Tests and rollback

Run `node --test test/portable-device-migration.test.mjs test/zero-credit-boundary.test.mjs`, `bash -n scripts/portable-runner-enroll.sh`, `node scripts/create-release-baseline.mjs --verify`, and require both existing exact-head `Verify (ubuntu-latest)` and `Verify (windows-latest)`. Roll back by reverting this PR's small sovereign label change; no local devices, credentials or Cloudflare resources are modified by landing the PR itself.

References: [GitHub self-hosted runner enrollment](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners), [service configuration](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/configure-the-application), and [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
