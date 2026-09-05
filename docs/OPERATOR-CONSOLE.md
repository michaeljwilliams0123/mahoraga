# Operator console

The operator console is the singular cloud UI for GitHub and fleet commands.

## Split of duties

| Job | Surface |
|---|---|
| Inspect repo, isolate issues, review the 4-hour cycle | Operator console |
| Merge / approve / comment / close / create issues | Operator console (owner `gh` session) |
| Dispatch the four-hour candidate cycle | Operator console write plane |
| Preview / delete eligible Wave A contained branches | Operator console write plane |
| Conversation, files, Cloud Pro | Vercel `cloud-app/` at https://mahoraga-cloud-workspace.vercel.app/ |
| Local runtime, `npm run status`, activate a verified release | Windows / Chromebook loopback `127.0.0.1:4782` |
| Destiny fire, Cloud Pro spend, Windows 7.0 activate | Hard deny on the operator console |

## Protect main

Ruleset `22327855` **Protect main — exact-head Verify** is active on the default branch.

Required checks:

- Verify (ubuntu-latest)
- Verify (windows-latest)
- Verify unified Vercel workspace

Strict up-to-date. No bypass actors. Issue #78 is the settings write; once evidence is on the thread it should be closed as completed. A file in git is not branch protection.

## Four-hour self-update

Workflow file is still named `.github/workflows/sovereign-eight-hour-cycle.yml`. Display name is **Sovereign Four Hour Candidate Cycle**. Cron heartbeats at minute 7/22/37/52 every hour. The 4-hour window is software (tags `sovereign-cycle-anchor-v2-*` / `sovereign-cycle-complete-v2-*`), not cron.

Self-update **opens a candidate PR**. It does not merge. It does not activate Windows 7.0. Merge still requires exact-head Verify.

## Language lock

TypeScript for `cloud-app/` and the operator console. Existing Node.js `.mjs`
control plane stays. Do **not** convert either UI to JavaScript. ChatGPT /
Copilot guardrails are not a rewrite license. See
[`ECOSYSTEM-LOCK.md`](ECOSYSTEM-LOCK.md) and `.github/copilot-instructions.md`.
