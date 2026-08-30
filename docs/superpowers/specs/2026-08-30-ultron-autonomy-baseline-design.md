# Mahoraga Ultron Autonomy Baseline Design

## Outcome

Mahoraga treats ordinary Control Center conversation as authority to plan and execute a complete objective. It may create parallel implementation lanes, use structured proposer/critic/synthesizer debate, implement changes, repair failed checks, merge its own eligible pull requests, publish an immutable update, and activate that update through the existing canary and rollback path.

The default is autonomous operation, not advisory operation. The user can still stop work, cancel an objective, disable automatic integration, or invoke rollback.

## Existing architecture reused

The implementation extends existing conversation records, objective graphs, isolated workers, Codex Builder, cloud/Destiny coordination, integration receipts, release artifacts, and verified automatic repair. It does not add another scheduler, database, or unrestricted shell.

## Conversation-driven execution

Posting a user message with `requiresResponse: true` creates one autonomy objective when `manifest.autonomy.conversationActivation` is enabled. The response includes both the stored message and objective so the UI can immediately render progress.

Each objective contains this dependency graph:

1. `propose` - Primary Codex produces a bounded implementation proposal.
2. `challenge` - an independent Codex lane attacks assumptions and failure modes.
3. `synthesize` - Primary Codex selects a direction using proposal and challenge evidence.
4. `implement` - Codex Builder changes only the declared task area.
5. `verify` - repository worker runs the declared verification profile.
6. `integrate` - repository/cloud integration produces a merge-after-verify receipt.

Only bounded task summaries, receipt digests, decisions, and dissent codes persist. Raw private chain-of-thought and provider response bodies are not stored as debate records.

## Autonomy policy

`mahoraga.manifest.json` declares `autonomy` as canonical policy:

- baseline mode `ultron`;
- conversation activation enabled;
- structured debate enabled;
- automatic integration enabled;
- maximum two concurrent implementation lanes;
- same-repository branch prefixes eligible for automatic integration;
- one full `npm run verify` gate before merge;
- automatic stable update publication after main integration;
- canary activation and automatic rollback remain required.

Normal repository, UI, worker, skill, provider, node, link, and routing changes may integrate without attended approval.

## Root protections

Autonomous pull requests cannot change their own root of trust. Protected paths include repository governance, GitHub workflows, the autonomy merge-policy validator, secret scanning/audit code, manifest authority fields, update-contract code, and rollback code. A user-approved bootstrap change may establish or revise these paths; subsequent autonomous changes cannot.

Credentials remain runtime-only. Repository visibility remains private. Public listeners, destructive Git history, unbounded spending, secret export, and removal of rollback or kill-switch behavior remain ineligible for automatic integration.

## Automatic integration

A GitHub `workflow_run` workflow observes successful completion of `Verify Mahoraga`. It never checks out or executes pull-request code. It queries GitHub metadata, then calls a deterministic policy module that requires:

- successful conclusion for the exact head SHA;
- open, same-repository pull request targeting current `main`;
- eligible Mahoraga branch prefix;
- no protected-path changes;
- non-draft, mergeable state;
- serialized integration through one workflow concurrency group.

Eligible pull requests are squash-merged with the repository token. A changed base or conflict causes a retryable stop, not an override.

## Self-update

After autonomous merge, main verification runs. A successful main run triggers the existing release packaging logic through a reusable release workflow. The immutable archive, manifest, digest, and provenance remain mandatory. Local activation continues to require the existing checkpoint, health canary, and rollback behavior.

## Destiny UI lane

Destiny Codex works independently under PR #45 with write scope limited to `web/**` and `cloud-app/**`. It builds conversation-first UI, objective nodes and dependency links, agent/tool activity, admin-plugin health, automatic integration state, and release/rollback visibility. It may not edit autonomy policy or integration validators.

## Verification strategy

Use one focused red/green test for each new policy or route. Avoid repeated full-suite runs during development. Run `npm run verify` once after the core changes are complete, then rely on the existing Windows/Linux CI matrix before automatic integration.

