# Mahoraga implementation log

Updated: 2026-08-24

## Current wave

Wave 9 is repository-deployed and awaiting ordinary downstream Git sync. Cloud
Workspace 2.0 presents installed Skills, approval and release views, execution
lane selection, and the exact credit boundary. The Cloud Task Gateway converts
only owner-approved issue commands into deterministic Codex cloud or desktop
records. The staged release lane adds full verification, strict SHA-256 update
metadata, and provenance without activating a local device.

No Windows runtime, browser session, GitHub Desktop setting, or local provider
was changed as part of Wave 9.

## Previous wave

Wave 8 safe first increment is deployed. The Browser Worker now owns an
isolated headless Chrome profile and can observe only the loopback Control
Center. It records bounded screenshot, network, console, and DOM-title
verification evidence without persisting page content, URLs, cookies, or image
bytes in SQLite.

## Active runtime

The per-user supervised Mahoraga 3.3.0 runtime is healthy on
`127.0.0.1:4782`. Enabled providers are `local-core`, `repository`, `browser`,
and `self-healer`. The last successful deployment is `124dca8`; the live
`browser.observe` boundary completed with worker verification and an immutable
execution receipt.

## Known boundaries

- The first live Browser 2.0 smoke exposed an outdated title expectation. It is
  repaired in `124dca8`; the preserved failed task is diagnostic history, not a
  current outage.
- GitHub Copilot execution remains disabled because the authenticated account's
  monthly quota is exhausted.
- Primary Codex Builder direct execution remains disabled because the installed
  Desktop AppX executable is not callable through a supported local CLI.
