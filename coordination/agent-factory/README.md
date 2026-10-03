# Mahoraga Agent Factory

`registry.json` is the durable, GitHub-native registry of permanent Mahoraga child-agent definitions.

Every child created through `src/agent-foundry.mjs` inherits these non-optional properties:

- `permanent: true`
- `selfUpdate: true`
- `zeroCredit: true`
- `sharedFeatLedger: true`
- `ownerApprovalRequired: false`
- `platformAuthorizationRequired: true`

The last two fields mean Mahoraga does not add a second approval merely because a permanent child performs an operational action already covered by the active owner grant. Child bots do not receive a separate permission universe: they inherit `mahoraga-core` operational authority only through the same owner/platform/capability intersection, and the action must remain bound to fresh objective, authority, source-SHA, trust-epoch, evaluator, cost, audience, and security evidence. Any material drift fails closed. Ownership transfer, permanent owner-recovery removal, destruction of every rollback generation, and root-credential transfer remain non-delegable.

The two-hour learning workflow may add new manifests only for deterministic, actionable, uncovered capability gaps. It never activates the Windows production runtime.
