# Mahoraga Self-Extension Capability Pack

This pack adds new composition surfaces without replacing Mahoraga's existing runtime, UI, authentication, workers, workflows, provider contracts, or release controls.

## Preservation rule

The default preservation mode is `additive-no-delete-rename` against the current `main` baseline. Existing Grok-derived or otherwise pre-existing work is treated as part of that baseline even when its original author cannot be proven from Git metadata. This pack does not claim authorship over preserved baseline behavior.

`src/baseline-preservation.mjs` rejects deleted or renamed baseline files. Existing repository protection, exact-head verification, integration leases, execution-cell containment, and release activation controls remain authoritative.

## Added lanes

- `artifact.create` validates the requested MIME type and extension against the existing artifact contract and writes bytes through the existing encrypted local artifact store/content vault. The capability does not invent Office/PDF encoders; compatible authoring tools or agents can supply valid bytes and Mahoraga stores them through the established contract.
- `code.create-test` delegates bounded implementation and relevant tests to the existing Primary Codex Builder disposable execution cell.
- `self.patch` delegates bounded repair candidates to the same Builder and preserves the existing architecture by default.
- `agent.replicate` uses the existing Agent Foundry child-manifest contract and only permits registry edits when the task's allowed paths and integration lease include `coordination/agent-factory/registry.json`.
- `self.enhance` composes the existing Codex Builder, execution-cell, generated-code safety, and evolution contracts to prepare bounded enhancement candidates.

These are candidate-producing powers. They do not grant direct writes to protected `main`, bypass CI, bypass provider authorization, activate Windows production, or add a paid OpenAI API fallback.

## Operator surface

Use:

```text
node scripts/mahoraga-self-extension.mjs <capability> <request.json|->
```

Supported capabilities are `artifact.create`, `code.create-test`, `self.patch`, `agent.replicate`, `self.enhance`, and `baseline.check`.

Code-oriented requests continue to require the existing Builder task fields, including a base commit, bounded allowed paths, and an integration lease. Artifact creation uses the same local encrypted content-vault path already used by Mahoraga's artifact inspection runtime.

## Resources and agents

`resources.json` records the existing modules used by each lane. Operator-attached GitHub connectivity, Steward children, Superpowers planning/TDD/verification skills, OpenAI Developers guidance, and other connected plugins may help design, review, verify, or route work, but they do not silently become runtime authority. Each provider or connector keeps its own authorization boundary.

The permanent `mahoraga-self-extension-builder` Steward child participates in the same shared feat ledger and zero-credit inheritance contract as the other children.
