# Power Platform UCF Provider Design

## Status

Approved architectural direction following PR #289. This spec defines the next implementation slice; it contains no live tenant identifiers, credentials, user addresses, agent GUIDs, environment URLs, bearer tokens, cookies, or connection secrets.

## Objective

Make Microsoft Power Platform a first-class provider family behind Mahoraga's Universal Capability Fabric (UCF), so Copilot Studio agents, Microsoft 365 Copilot, Dataverse/Power Platform operations, Power Apps/flows, and specialist AI agents can assist one objective without becoming hard-coded dependencies of the brain.

The end user continues to see one Mahoraga conversation. Provider selection, authentication reuse, routing, recovery, and multi-agent synthesis remain behind the scenes.

## Selected approach

Use three transport tiers in order:

1. Native authenticated Power Platform/Copilot Studio APIs and existing connector surfaces.
2. PAC-backed discovery, administration, clone/pull/push/publish, and bounded readiness metadata.
3. Ephemeral authenticated relay/tunnel only when an inbound callback cannot be completed through an outbound/native path.

This preserves maximum practical reach while minimizing exposure in a public repository.
## Alternatives considered

### A. PAC-only orchestration

Use `pac` for nearly every Microsoft interaction. This is simple for agent lifecycle operations but weak for conversational invocation, runtime portability, structured receipts, and long-lived automation. Rejected as the primary execution model.

### B. Direct API/connector provider family — selected

Use official Power Platform, Copilot Studio, Microsoft Graph, Dataverse, and connector APIs for runtime execution; use PAC for discovery/admin. This produces structured, authenticated, auditable operations and fits UCF routing/recovery.

### C. Tunnel-first universal bridge

Expose Mahoraga through a reverse proxy/tunnel and let Microsoft callbacks drive most work. This maximizes reach but creates unnecessary ingress, endpoint-defense noise, and public-repo operational risk. Retained only as a fallback transport.

## Provider family

The Microsoft family is capability-first, not one worker with unlimited authority:

- `m365.*` — enterprise reasoning/opening and later Graph-backed deterministic work.
- `studio.*` — Copilot Studio agent discovery, invocation, configuration, provisioning, deployment.
- `powerplatform.*` — Dataverse/custom API/flow/app operations and provider health.
- `queue.*` — existing durable Dataverse queue semantics where available.

Each capability independently declares data classes, cost class, authority scopes, idempotency, recovery behavior, and provider health.
## Runtime discovery and identity

Live Microsoft identity is resolved at runtime from already-authorized local/provider state. The public repository stores only schemas and stable logical aliases such as `general-mahoraga`, `tenant-health-reader`, or `enterprise-core`; environment URLs, agent IDs, tenant IDs, user identities, connection IDs, and secrets remain outside Git.

Discovery returns a sanitized registry containing only:

- logical agent alias
- published/provisioned/active booleans
- supported capability classes
- connection/authentication class
- bounded latency/health metadata
- environment class, never the concrete environment URL or identifier

PAC may be used to discover and administer agent workspaces, but raw PAC table output is never persisted as runtime planning state.

## Authentication broker

The provider consumes opaque authentication references, never raw credentials in tasks. Runtime authentication can use an existing OS/PAC/Dataverse credential tier or an approved external connection reference.

Short-lived access tokens may exist only inside the provider process that needs them. They are not returned in receipts, written to logs, committed to Git, stored in conversation state, or exposed to model prompts.

Authentication failure is classified separately from authority failure. UCF may refresh/reacquire an existing authorized session automatically; it may not invent tenant permission or widen scopes.
## Zero-credit admission policy

Zero-credit is an execution admission rule, not only a ranking preference. Each Microsoft capability declares a runtime billing class: `deterministic-zero`, `license-included`, `metered`, or `unknown`. Under the default `zero-credit` provider policy, only `deterministic-zero` and runtime-attested `license-included` routes are eligible. `metered` and `unknown` routes remain blocked even when healthy and authorized.

PAC discovery/health is `deterministic-zero`. Microsoft 365 Copilot licensed APIs and standard-harness agent use inside eligible Microsoft 365 channels may be `license-included` when the authenticated user/license/channel attestation proves that condition. A direct Copilot Studio SDK/custom-app invocation is `unknown` unless runtime evidence establishes license-included billing for that concrete route; it must not be invoked merely because authentication succeeds. No paid fallback is automatic.

## Agent invocation contract

`studio.delegate` accepts an objective reference, requested role, bounded input reference, expected result contract, and idempotency key. It does not accept arbitrary recipient identifiers, raw access tokens, arbitrary URLs, shell commands, or caller-selected executable paths.

Supported logical roles initially include:

- `reasoner` — analyze and propose.
- `researcher` — gather bounded Microsoft-side evidence.
- `analyst` — compare/synthesize structured findings.
- `builder-advisor` — propose implementation or app/flow construction steps without directly mutating Mahoraga source.
- `validator` — independently challenge a candidate/result.
- `workflow-advisor` — propose Power Automate/Power Platform orchestration.

The runtime registry maps those roles to currently published agents/capabilities. A role may have multiple eligible providers; UCF ranks them by authority, health, data class, cost, latency, and observed reliability.

## Multi-model assistance

Mahoraga may fan out a complex objective to multiple eligible reasoning providers when expected value justifies the cost. Fan-out is bounded and role-based rather than "ask every model."

A typical high-complexity mutation flow is:

`observe -> reason/propose in parallel -> challenge/validate -> synthesize -> mutation candidate -> bounded builder -> repository verify -> integrate`.

If deterministic/local or already-licensed providers can satisfy a step, they rank ahead of metered providers. A provider failure can be rerouted without restarting the owner-visible conversation.
## Mutation boundary

Copilot Studio/Power Platform agents do not receive unrestricted repository mutation authority merely because they can reason about code. Their outputs are normalized into a `mutation-candidate` envelope containing proposed changes, evidence references, provenance, expected verification, and confidence.

Only a registered Mahoraga builder capability may convert a mutation candidate into source changes, and it remains constrained by the existing owner-authority, integration-lease, path, verification, and exact-head integration contracts.

Self-evolution may use Microsoft agents to propose or challenge changes to Mahoraga's brain, routing, or policies, but those suggestions enter the same candidate -> build -> verify -> integrate lifecycle as any other provider.

## Power Apps and Power Automate

Power Apps/Power Automate are exposed as capabilities, not as privileged side channels. Initial logical capabilities are:

- `powerplatform.health`
- `powerplatform.discover`
- `powerplatform.invoke`
- `powerplatform.flow-run`
- `powerplatform.app-build-advice`

Write/action capabilities require the full registered owner and platform scope intersection. Readiness discovery is side-effect free. Flow/app actions must be idempotent where the Microsoft surface supports it; otherwise Mahoraga records a non-idempotent classification and avoids blind automatic replay.
## Optional relay/tunnel transport

A tunnel/reverse proxy/port-forward may be used only when a Microsoft callback genuinely requires inbound reachability and no supported outbound/native alternative is practical.

The fallback transport must be:

- disabled by default
- explicitly bound to one registered capability and one callback path
- authenticated with a short-lived high-entropy session proof
- unable to choose an arbitrary local destination or executable
- rate/size/time bounded
- automatically expiring
- immediately revocable through the owner kill switch
- unable to expose directory listings, generic HTTP proxying, shell access, browser debugging, or repository contents

Public Git stores only the transport contract and implementation. Endpoint URLs, session proofs, tunnel credentials, callback secrets, and concrete local ports are runtime state only.

## Communication boundary

During development and validation, autonomous communication remains limited to the owner and registered Mahoraga/Copilot Studio agents. No capability may infer or enumerate human recipients from Teams, Outlook, directory data, or channels and send messages without a separately registered recipient-authorized capability.
## Recovery and failure classification

The provider returns normalized failure classes rather than provider-specific free text:

- `authentication-required`
- `authority-denied`
- `agent-unavailable`
- `environment-unavailable`
- `rate-limited`
- `transient-provider`
- `permanent-provider`
- `invalid-contract`
- `callback-unavailable`

UCF may refresh readiness/authentication, retry with bounded backoff, reroute to another compatible provider, or switch transport tier. Structural authority/data-class denials remain non-recoverable.

## Receipts and learning

Every completed provider action returns bounded metadata: objective/task ID, logical capability, logical agent role, provider class, route fingerprint, latency, outcome, verification state, and opaque result/evidence references.

Raw prompts, model reasoning, access tokens, tenant identifiers, private user addresses, Microsoft object IDs, and connector secrets are not persisted in public coordination artifacts.

Observed success, latency, failure class, and verification quality may update UCF route reliability. Provider outputs do not directly rewrite their own authority, routing score, or source code.
## Initial implementation decomposition

### P1 — Provider discovery and health

Add a Power Platform provider module that verifies the existing authenticated Microsoft surface, discovers published/provisioned agent capability classes, and returns sanitized readiness metadata. No live agent invocation is required for this first sub-step.

### P2 — Copilot Studio invocation

Implement `studio.delegate` through the supported authenticated Power Platform/Copilot Studio conversation surface. The adapter resolves a logical agent role to a runtime binding and returns a normalized result reference/receipt.

### P3 — UCF registration and routing

Enable the provider family in the manifest/capability graph, preserve the existing multi-scope authority rules, and make the conversation planner eligible to select `studio.*`/`powerplatform.*` where appropriate.

### P4 — Mutation-candidate synthesis

Normalize multi-agent outputs into bounded mutation candidates; feed those candidates to the existing builder/verifier rather than giving agents direct arbitrary source mutation.

### P5 — Optional callback transport

Only if a concrete Microsoft integration requires inbound callbacks, implement the scoped ephemeral relay/tunnel contract described above. This is not required to land P1–P4.
## Verification strategy

The implementation must include deterministic tests for:

- sanitizing discovery output so live tenant/user/agent identifiers never enter public artifacts
- capability-specific authority intersection and revocation
- role-to-agent binding without arbitrary recipient/agent injection
- bounded short-lived token handling with no token in receipts/logs
- provider-unknown/process-starting recovery through UCF
- multi-agent fan-out limits and cost ordering
- mutation-candidate normalization and builder-only source mutation
- idempotent/retry behavior and non-idempotent replay suppression
- tunnel fallback disabled by default and unable to become a generic proxy/shell/forwarder
- development messaging remaining owner/Mahoraga-only

Live Microsoft tests, where available, must use an already-authorized connection and a harmless agent-only handshake or read-only operation. They must not message unrelated humans or channels.

## Success criteria

1. Mahoraga can discover a usable Power Platform/Copilot Studio provider without exposing tenant-specific secrets in Git.
2. UCF can select a Microsoft agent role invisibly from normal conversation planning.
3. `studio.delegate` can complete a machine-to-agent round trip and return a normalized receipt.
4. Multiple eligible AI providers can contribute to one objective without requiring the user to select providers.
5. Agent recommendations can become mutation candidates, but only the bounded Mahoraga builder can mutate source.
6. Authentication/session expiration is recoverable without restarting the owner-visible objective where platform policy permits.
7. No public ingress is required for normal operation; any fallback ingress is ephemeral and narrowly scoped.
8. Existing UCF, repair, exact-head verification, and owner-authority contracts remain green.
## Non-goals

This slice does not:

- commit live Microsoft tenant, environment, agent, user, or connection identifiers
- make a public tunnel the default control plane
- bypass Microsoft Entra/tenant/Power Platform authorization
- let a Copilot Studio agent directly execute arbitrary local shell commands
- let a model self-grant authority or change its own permission ceiling
- broadcast to Teams, Outlook, directories, or human channels
- replace UCF with a Microsoft-specific planner
- require every available model to participate in every objective

## Decision

Build Power Platform as an extensible UCF provider family. Prefer native authenticated APIs and connectors, reuse existing Microsoft authentication surfaces, use PAC for bounded discovery/administration, normalize agent outputs into evidence/mutation candidates, and reserve tightly scoped ephemeral ingress for callback cases that cannot be solved outbound-first.

This design intentionally turns Microsoft/Copilot Studio into additional interchangeable capabilities for Mahoraga rather than another orchestration brain beside Mahoraga.