# Mahoraga implementation log

Updated: 2026-08-25

## Current wave

Wave 10 is live on the Windows production runtime. Mahoraga 3.5.1 adds nine
evidence-led expert methods, fixes SharePoint/OneDrive misrouting, hardens
picker/paste attachment intake, and rejects acknowledgement-only or otherwise
unverified answers through bounded retry/reroute and explicit unresolved
receipts. The full repository verification passed 198/198 tests, followed by
live browser acceptance for a pasted image, a private local Visio attachment,
provider-gap routing, expert-method rendering, and an empty console error log.

Primary Cloud Codex review is dispatched through private GitHub issue `#36`
using the validated, content-free task record in `coordination/cloud-tasks/`.

## Previous wave

Wave 8 safe first increment is deployed. The Browser Worker now owns an
isolated headless Chrome profile and can observe only the loopback Control
Center. It records bounded screenshot, network, console, and DOM-title
verification evidence without persisting page content, URLs, cookies, or image
bytes in SQLite.

## Active runtime

The per-user supervised Mahoraga 3.5.1 runtime is healthy on
`127.0.0.1:4782`. Enabled providers are `local-core`, `repository`, `browser`,
and `self-healer`. The last successful deployment is `8e7a17c`; the live
acceptance run confirmed four current worker heartbeats, nine expert profiles,
private multimodal intake, and bounded unresolved-answer receipts.

## Known boundaries

- The first live Browser 2.0 smoke exposed an outdated title expectation. It is
  repaired in `124dca8`; the preserved failed task is diagnostic history, not a
  current outage.
- GitHub Copilot execution remains disabled because the authenticated account's
  monthly quota is exhausted.
- Primary Codex Builder direct execution remains disabled because the installed
  Desktop AppX executable is not callable through a supported local CLI.
