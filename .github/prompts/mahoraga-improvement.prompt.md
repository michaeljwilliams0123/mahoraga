---
name: mahoraga-improvement
description: Turn a recurring Mahoraga failure into a tested improvement candidate for user review.
agent: agent
tools: ['search/codebase', 'edit/editFiles', 'execute/runInTerminal']
argument-hint: failure=<brief failure description>
---
Create an improvement candidate for `${input:failure:the recurring failure}`.

Follow this sequence:

1. Reproduce or establish deterministic evidence for the failure.
2. Identify the smallest root-cause fix.
3. Add a regression test before or with the implementation.
4. Run the relevant suite and the full verification command.
5. Summarize the changed files, test evidence, and rollback path.
6. Stop at a reviewable candidate. Do not activate, merge, publish, deploy, or change Mahoraga's update authority.

