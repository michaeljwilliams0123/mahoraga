# Mahoraga Agent Factory

`registry.json` is the durable, GitHub-native registry of permanent Mahoraga child-agent definitions.

Every child created through `src/agent-foundry.mjs` inherits these non-optional properties:

- `permanent: true`
- `selfUpdate: true`
- `zeroCredit: true`
- `sharedFeatLedger: true`
- `ownerApprovalRequired: false`
- `platformAuthorizationRequired: true`

The last two fields mean Mahoraga does not add a separate owner-approval gate for credential or privilege changes, while still respecting GitHub/OAuth/provider authorization that the underlying platform actually enforces.

The two-hour learning workflow may add new manifests only for deterministic, actionable, uncovered capability gaps. It never activates the Windows production runtime.
