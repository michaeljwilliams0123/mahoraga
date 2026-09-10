# Owner-Sovereign Copilot Studio Control Plane — Design

**Status:** Proposed architecture approved in conversation; written spec for owner review before implementation.

**Date:** 2026-09-10

## 1. Objective

Evolve Mahoraga from a system that can exchange narrowly-scoped GitHub receipts with Copilot Studio into a control plane that can select, invoke, observe, and provision Microsoft-side agent capabilities under the owner's delegated authority.

The design treats Copilot Studio as a first-class Mahoraga worker ecosystem rather than a separate chatbot integration.

The target authority relationship is:

```text
Owner
  -> Owner Authority Grant
    -> Mahoraga Authority Resolver
      -> Registered Capability
        -> Actual Platform / Connector Permission
```

Mahoraga should not impose an additional blanket approval layer for every capability after the owner has already delegated that authority. Effective authority is bounded by what the connected platform actually grants.

```text
effectiveAuthority = ownerGrant ∩ platformGrantedPermissions ∩ registeredCapability
```

This is an intersection, never an invented union. Mahoraga cannot fabricate access the platform did not grant.

## 2. Relationship to PRs #281–#284

This design deliberately builds on the existing recent PRs rather than replacing them.

- **#281 — Copilot Studio two-way feed:** becomes the transport-contract foundation for dispatch and receipts.
- **#282 — offline contract validator:** remains the zero-credit deterministic validation layer.
- **#283 — agent provisioning request:** becomes the seed for a generalized provisioning capability rather than a permanently human-only design.
- **#284 — autonomy envelope:** becomes the governance foundation and gains an owner-delegation layer so authority is capability-aware rather than globally gated by action category.

No competing authority framework should be introduced beside #284.

## 3. Desired Operating Model

Mahoraga receives an objective and decides whether a Microsoft capability is useful. The planner asks the capability registry for eligible workers. The authority resolver determines whether the owner's grant and the connected Microsoft platform both permit the requested operation. The Copilot Studio bridge performs the supported operation and returns a structured execution receipt and result reference to Mahoraga.

```text
User / Owner
    |
Mahoraga Brain
    |
Goal / Plan Engine
    |
Capability Router
    |
Authority Resolver
    |
Copilot Studio Bridge
    |
Microsoft / Power Platform capability
    |
Execution Receipt + Result Reference
    |
Mahoraga State / Planner continuation
```

The bridge is not itself the policy engine. It executes already-resolved authority.

## 4. Owner-Sovereign Delegation

### 4.1 Default posture

Owner delegation is broad by default inside the scopes the owner explicitly grants to Mahoraga. Newly registered capabilities may inherit an existing compatible grant without requiring a new code or policy edit for every worker.

Examples of delegable scopes include:

- `repo.read`
- `repo.write`
- `pr.manage`
- `workflow.dispatch`
- `artifact.manage`
- `connector.invoke`
- `copilot.invoke`
- `copilot.configure`
- `copilot.provision`
- `deployment.request`
- `deployment.execute`
- `governance.manage`
- `accessibility.manage`

Scopes describe owner intent. They do not override platform authorization.

### 4.2 Effective authority

Every execution resolves all three dimensions:

1. **Owner grant** — what the owner allows Mahoraga to do.
2. **Platform grant** — what GitHub, Microsoft, a connector, or another system actually allows the current authenticated connection to do.
3. **Capability declaration** — what the registered worker claims and is implemented to do.

An action is executable only where all three overlap.

### 4.3 Provenance

Every privileged action records metadata sufficient to answer:

- which owner grant authorized it;
- which Mahoraga capability executed it;
- which platform connection was used;
- requested scope and resolved scope;
- task / objective identifier;
- time of execution;
- outcome;
- revocation state at execution time.

Audit records must not contain secret values, raw bearer tokens, private prompts that are not explicitly configured for logging, or credential material.

### 4.4 Revocation

The owner can disable the grant globally or revoke individual scopes. Revocation is evaluated at execution time, not only when a task is created. A queued task loses authority immediately if its required scope is revoked before execution.

## 5. Autonomy Envelope Changes

PR #284 currently treats several action classes as globally gated. This design changes the model from categorical gating to capability-aware delegated authority.

The following classes become **owner-delegable** rather than permanently one-confirmation operations:

- merge to `main` where repository rules and the active execution surface permit autonomous exact-head landing;
- permission/security administration inside registered owner-granted administrative capabilities;
- deployment to Test or Prod where the connected deployment system grants the capability and owner policy allows that target;
- external sends/shares through specifically registered connectors and data classes;
- governance administration within owner-granted scope.

Some operations may still be configured as confirmation-required by owner policy, but that is configuration, not an intrinsic global prohibition.

The following remain structural boundaries:

- no secrets committed to Git;
- no fabricated or self-minted platform credentials;
- no impersonation of an identity that did not authorize the connection;
- no bypass of tenant, identity, or platform authentication controls;
- no generic public tunnel, reverse proxy, or port-forwarding escape path;
- no assertion of authority beyond what the connected platform grants.

## 6. Copilot Studio Bridge

### 6.1 Responsibility

The bridge converts Mahoraga task requests into supported Copilot Studio / Power Platform operations and converts Microsoft-side completion into Mahoraga execution state.

It owns:

- dispatch adaptation;
- correlation IDs;
- capability-specific payload validation;
- connection-reference resolution;
- receipt normalization;
- retries that are safe and idempotent;
- error classification;
- result references;
- liveness/readiness reporting.

It does not own:

- global planning;
- owner authority decisions;
- secret persistence in Git;
- arbitrary shell execution;
- identity impersonation.

### 6.2 Inbound task evolution

The #281 `copilot-studio-task` envelope is retained as the minimal transport contract, but live integration should evolve from a single hard-coded implementation-only job into a versioned capability dispatch.

Conceptually:

```json
{
  "schemaVersion": 2,
  "kind": "copilot-studio-task",
  "taskId": "cst-...",
  "capability": "copilot.invoke",
  "objectiveRef": "obj-...",
  "authorityRef": "grant-...",
  "payload": {},
  "resultContract": "...",
  "attempt": 1
}
```

Sensitive or large task content may be transported through the authenticated runtime channel instead of GitHub. GitHub coordination records should remain metadata-oriented.

### 6.3 Outbound execution state

The #281 content-free receipt remains valuable as a durable acknowledgement, but Mahoraga needs richer runtime state than `completed` alone.

The bridge should normalize states such as:

- `accepted`
- `running`
- `completed`
- `blocked-auth`
- `blocked-authority`
- `retryable`
- `failed`
- `cancelled`

A durable receipt can reference an external result artifact or runtime result ID without copying sensitive content into Git.

## 7. Capability Registry

Copilot Studio agents and Microsoft-side actions register as capabilities rather than being hard-coded into the planner.

A capability record should identify at least:

- stable capability ID;
- provider / plane (`copilot-studio`, `power-platform`, etc.);
- supported action scopes;
- input contract;
- result contract;
- data classifications accepted;
- authentication / connection-reference requirement;
- cost class;
- health state;
- deployment environment;
- whether invocation is idempotent;
- owner-policy tags.

This lets the model router / planner ask for a capability by function instead of by a hard-coded agent name.

## 8. Agent Provisioning

PR #283 currently allows only a draft request into Dev with `autoDeploy=false`. That is retained as the conservative baseline but generalized under owner delegation.

The future provisioning flow becomes:

```text
Mahoraga detects missing capability
  -> capability-provision request
  -> Authority Resolver
  -> Power Platform / Copilot Studio provisioning adapter
  -> create/configure in permitted environment
  -> platform-native deployment / promotion path
  -> register resulting capability
  -> health check
  -> capability becomes routable
```

Provisioning to Test or Prod is permitted only when:

- the owner grant allows the target;
- the authenticated Microsoft connection exposes the required operation;
- environment / pipeline policy permits it;
- the deployment adapter verifies the resulting state.

The implementation must not pretend that owner approval can replace Microsoft tenant, environment, pipeline, or identity permissions.

## 9. Credential and Sign-In Model

Mahoraga may use owner-authorized credentials or sessions to complete tasks, but credential material remains outside Git.

Git-tracked configuration stores opaque references such as:

- connection-reference IDs;
- secret-store aliases;
- credential profile names;
- session profile IDs.

The runtime credential broker resolves those references through the approved host or connector at execution time.

Rules:

- never write raw passwords, tokens, cookies, private keys, or bearer credentials to Git;
- never return secret values in coordination receipts;
- do not expose generic secret-read APIs to arbitrary tasks;
- capability execution receives only the credential/session reference it needs;
- revoking the external connection immediately removes effective authority.

## 10. Execution and Recovery

Each dispatched task is assigned a stable task ID and idempotency key.

The bridge may autonomously:

- retry transient platform errors;
- reconnect an authenticated connector;
- reroute to another compatible registered Microsoft capability;
- resume a previously accepted task;
- no-op duplicate receipts;
- create a repair task when the failure is within a registered repair capability.

It must not silently reinterpret an authentication or authorization failure as success.

Failure classes include:

- `invalid-contract`
- `capability-unavailable`
- `authority-denied`
- `platform-denied`
- `authentication-required`
- `rate-limited`
- `transient-provider`
- `permanent-provider`
- `stale-task`

## 11. Data Boundaries

GitHub remains primarily the durable coordination and evidence plane, not the universal transport for all Microsoft data.

Metadata-safe records may go to GitHub. Enterprise, personal, credential, or high-volume execution content should remain in the authenticated runtime / Microsoft plane and be represented in GitHub only by opaque references when needed.

The result contract therefore separates:

- execution metadata;
- status;
- artifact/result reference;
- optional redacted summary;
- sensitive payload location.

## 12. Merge and Deployment Semantics

This architecture distinguishes **Mahoraga's future runtime authority model** from the authority of any particular external operator or plugin used to edit this repository.

Mahoraga may be configured for autonomous exact-head merging when repository policy and the active execution capability allow it. An external assistant/plugin that has its own confirmation requirement still follows that tool's own contract.

Likewise, Microsoft deployment authority comes from the authenticated Power Platform / tenant configuration, not from a JSON declaration in this repository.

## 13. No-Tunnel Boundary

Remote integration must use authenticated, bounded application or relay interfaces. The design does not introduce ngrok, generic public tunneling, reverse proxies, arbitrary port forwarding, or an unrestricted supervisor shell.

A remote relay must expose named Mahoraga capabilities, not arbitrary network or executable access.

## 14. Implementation Decomposition

This architecture should be implemented as four separately verifiable increments rather than one broad rewrite.

### Increment A — Authority foundation

Extend #284 with the owner-delegation contract, authority resolver, revocation semantics, and deterministic tests.

### Increment B — Transport integration

Integrate #281 and #282 into the runtime as a registered Copilot Studio bridge with versioned dispatch and normalized receipts.

### Increment C — Live authenticated Microsoft adapter

Bind the bridge to an owner-authorized Microsoft / Power Platform connection using connection references and opaque credential/session references. Add live health and capability discovery without storing credentials in Git.

### Increment D — Provisioning and adaptive routing

Evolve #283 into owner-delegable provisioning, register resulting agents/capabilities, and allow the planner/router to select them dynamically.

Each increment must preserve the ability to operate and verify the preceding increment independently.

## 15. Verification Strategy

Deterministic tests should cover:

- owner grant intersection with platform permissions;
- deny when any one of owner/platform/capability authority is absent;
- grant revocation affecting queued tasks;
- capability registration and routing;
- invalid/unknown dispatch rejection;
- duplicate receipt idempotency;
- sensitive-field rejection from Git coordination records;
- auth-denied and authority-denied separation;
- retryable vs permanent provider errors;
- provisioning target restrictions derived from effective authority;
- no generic tunnel / arbitrary-executable capability introduced.

Zero-credit contract checks remain the default CI path. Model-backed probes are not required for repository verification.

Live Microsoft integration tests should be explicit integration tests against an already-authorized test connection and must not be required for every offline repository verify run.

## 16. Success Criteria

The architecture is successful when all of the following are true:

1. Mahoraga can discover a Copilot Studio capability and route a task to it from the normal planner path.
2. Effective authority is computed from owner grant, actual platform permission, and capability declaration.
3. The task can execute through an authenticated Microsoft-side adapter without credentials appearing in Git.
4. Mahoraga receives durable, idempotent execution state and can continue the parent objective.
5. Owner revocation immediately prevents later privileged execution.
6. A missing required Copilot capability can enter the provisioning path and, where platform and owner authority permit, become a registered routable capability.
7. Repository and platform protections remain authoritative; Mahoraga never claims permissions it does not actually possess.
8. The system requires no generic public tunnel or unrestricted shell to operate remotely.

## 17. Explicit Non-Goals

This design does not attempt to:

- bypass GitHub branch protection;
- bypass Microsoft tenant or identity controls;
- mint Copilot Studio identity tokens;
- impersonate another account;
- store raw secrets in the repository;
- create a generic internet-accessible tunnel into the local supervisor;
- replace the existing Mahoraga planner, capability registry, or task store with an unrelated architecture.

## 18. Decision

Use PR #284 as the governance foundation. Layer owner-sovereign delegation into the autonomy model, then integrate #281/#282 as the transport and validation foundation, followed by the live authenticated Microsoft adapter and the generalized #283 provisioning path.

The design intentionally pushes Mahoraga toward aggressive owner-delegated autonomy while preserving the real authorization boundaries imposed by GitHub, Microsoft, and each connected platform.