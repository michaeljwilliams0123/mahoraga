# Universal Capability Fabric — Design

**Status:** Architecture approved in conversation; written spec for owner review before implementation.

**Date:** 2026-09-10

## 1. Objective

Evolve Mahoraga from a collection of provider-specific workers into one universal execution fabric that can satisfy an objective across any registered local, cloud, desktop, browser, API, MCP, agent, or future capability without exposing lane selection to the owner.

The user experience remains one Mahoraga conversation. Provider selection, authentication readiness, capability discovery, fallback, recovery, and cost optimization happen behind the scenes.

The fabric extends the existing `universal-capability-graph.mjs`, `delegated-work-fabric.mjs`, capability registry, router, and owner-sovereign authority resolver. It does not create a parallel planner or second authority system.

## 2. Core Principle

Mahoraga plans against **capabilities**, not vendors.

Examples include `reason`, `search`, `read`, `create`, `edit`, `send`, `run`, `browse`, `deploy`, `authenticate`, `transact`, and `verify`.

Microsoft 365, Google Workspace, GitHub, GitLab, Copilot Studio, Codex, local models, browser workers, Windows applications, MCP servers, and future providers are execution routes for those capabilities.
## 3. Owner Experience

The owner gives one objective and receives one final Mahoraga response.

No provider selector, handoff prompt, or visible route switch is required during ordinary execution. Route details are diagnostic metadata available only in Advanced / Control Center views.

Interactive consent or sign-in may still appear when an external platform requires it. Mahoraga treats that as a resumable authentication wait state and continues the same objective after authorization rather than forcing the owner to restart.

A provider outage, quota condition, stale session, unavailable desktop, or missing route must not automatically terminate the objective when another compatible route can be discovered, repaired, provisioned, or substituted.

## 4. Universal Execution Flow

```text
Owner intent
  -> Goal / Intent Compiler
  -> capability requirements
  -> Universal Capability Graph
  -> Authority + Identity + Data + Cost Resolver
  -> Dynamic Route Planner
  -> Execute
  -> Verify
  -> recover / reroute / provision if needed
  -> continue objective
  -> one owner-facing result
```

Each subtask retains the same objective lineage, authority reference, idempotency identity, and evidence chain across route changes.
## 5. Capability Graph v2

The existing graph remains the canonical topology but gains richer route metadata and runtime discovery.

Each route should describe:

- stable capability and worker/provider identifiers;
- interface type and execution plane;
- current availability and evidence freshness;
- accepted data classifications;
- authority scopes required;
- authenticated identity / tenant fingerprint, never raw credentials;
- cost class and optional measured/estimated unit cost;
- reliability, latency, workload, concurrency, and rate-limit state;
- attendance requirement;
- idempotency support;
- rollback / compensation support;
- health and canary evidence;
- fallback and substitution relationships.

Graph nodes may be declared statically or discovered from trusted adapters. Discovery never grants authority by itself; discovered capabilities become executable only after the existing owner/platform/capability authority intersection succeeds.

Capability aliases normalize vendor-specific operations into portable functions. For example, SharePoint and Google Drive document edits may both satisfy a generic `document.edit` need while preserving provider-specific constraints in the route record.
## 6. Dynamic Discovery and Admission

Mahoraga continuously reconciles the capability graph from trusted sources rather than requiring a code release for every availability change.

Discovery sources may include:

- canonical manifest workers;
- authenticated connector inventories;
- MCP tool manifests with fixed transports;
- local installed-application capability probes;
- provider APIs that expose supported operations;
- Copilot Studio agent inventories;
- GitHub / GitLab integration metadata;
- owner-installed future adapters.

Discovery is metadata-only where possible and should not consume model credits merely to determine availability.

A discovered route passes through an admission step that validates its schema, provider identity, transport type, data classes, authority requirements, cost class, and health evidence. Unknown transports or undeclared executable paths remain non-routable.

Successful admission updates runtime graph state without changing the owner-facing conversation.
## 7. Routing Policy

Routing is multi-objective and adaptive rather than a fixed provider chain.

For every candidate route, Mahoraga evaluates:

1. authority intersection;
2. data-class compatibility;
3. current health / freshness;
4. task fitness and native capability match;
5. economic tier and expected marginal cost;
6. reliability and recent verified success rate;
7. latency and current workload;
8. attendance / session requirements;
9. idempotency and recovery quality.

The default preference remains local/deterministic first, then already-licensed native services, then subscription-covered AI, then metered services when owner policy permits them.

A higher-cost route may win when it materially improves task fitness, reliability, or completion probability. Cost optimization must not silently substitute an incapable route merely because it is cheaper.

Recent verified outcomes feed route scoring so a repeatedly failing provider is automatically deprioritized until fresh health evidence recovers it.
## 8. Recovery Instead of Dead Ends

`waiting` and `blocked` become diagnostic states inside an objective, not automatic terminal outcomes.

When a route fails, Mahoraga should classify the failure and choose the cheapest valid recovery action:

- retry the same idempotent route with bounded backoff;
- refresh authentication or readiness evidence;
- select another compatible route;
- resume through an attended session when required;
- repair a registered local worker;
- provision or configure an already-authorized capability;
- create a verified adapter candidate when no implementation exists;
- return to the planner with explicit residual constraints if no lawful route can complete the work.

Recovery keeps the original objective and idempotency lineage so switching providers cannot accidentally duplicate sends, writes, deployments, purchases, or other non-idempotent actions.

Mahoraga may perform these recovery steps autonomously when the owner grant and actual platform permissions authorize them.
## 9. Capability Acquisition and Self-Expansion

When the graph has no compatible live route, Mahoraga may attempt capability acquisition before giving up.

Acquisition order:

1. discover an already-installed or already-connected capability;
2. enable or configure an existing registered adapter when owner/platform authority permits;
3. provision a supported provider-side resource from an approved template;
4. generate an additive adapter candidate in an isolated implementation branch/worktree;
5. run deterministic contract, containment, and exact-head verification;
6. register and canary the verified capability;
7. activate it only within the owner-sovereign authority envelope and external platform permissions.

Newly acquired capabilities inherit compatible owner authority only through the authority resolver. A new tool cannot widen its own grant.

Self-expansion must preserve existing repo boundaries: no mass rewrite, no unrestricted supervisor shell, no caller-selected executable path, no credential persistence in Git, and no unverified direct production mutation.
## 10. Microsoft as One Native Plane

The Microsoft integration becomes a first-class provider family inside the universal fabric rather than a special top-level mode.

Preferred Microsoft routes are:

- Microsoft Graph for deterministic M365 reads/writes/actions;
- Microsoft 365 Copilot APIs for enterprise reasoning and synthesis when covered by the user's license and permitted by the tenant;
- General Mahoraga / Copilot Studio for multi-step agent workflows and Microsoft-side orchestration;
- attended Windows / Office application control only when a supported API or connector cannot satisfy the task.

Work IQ is not the default reasoning route when an equivalent non-metered or subscription-covered route exists. Its capability remains available when its unique context is required and owner cost policy admits it.

The Microsoft desktop application is a user interface, not a transport dependency. Camera, microphone, and location permissions are not required by this fabric.

The Microsoft plane uses official authenticated outbound HTTPS interfaces. It must not require inbound public listeners, browser debugging ports, reverse proxies, port forwarding, or tunneling.
## 11. Other Provider Families

The same fabric model applies to:

- Google Workspace APIs and signed Chrome handoff;
- GitHub and GitLab repository / CI / release operations;
- ChatGPT / Codex execution surfaces;
- local deterministic workers and local models;
- browser automation for supported web-only operations;
- Windows / Office desktop automation;
- MCP servers with fixed, validated transports;
- external APIs and future owner-installed connectors.

Provider-specific adapters may expose richer native operations, but they normalize into shared capability classes for planning and verification.

The fabric must support multiple providers for the same capability and multiple capabilities from one provider. Provider identity never becomes the objective identity.
## 12. Identity, Authentication, and Secrets

Every provider adapter receives an opaque credential or session reference from the provider, operating system, connector, or approved secret store. Planning state may retain only bounded metadata such as authenticated state, tenant/account fingerprint, granted scopes, expiry, and connection health.

Passwords, refresh tokens, browser cookies, API keys, bearer tokens, and raw secret values must not be copied into the capability graph, prompts, Git, coordination records, receipts, or ordinary diagnostics.

Authentication can be:

- silent and reusable;
- attended / interactive;
- task-scoped;
- unavailable.

The router prefers silent authenticated routes when task fitness is equivalent. When interactive consent is required, the objective pauses at the authentication boundary, preserves state, and resumes automatically after verified authorization.

Identity is provider-specific but authority remains owner-sovereign: the effective execution scope is always the intersection of owner grant, platform grant, and exact registered capability.
## 13. Human Communication Boundary

Universal coverage must not become accidental broadcast authority.

During development, discovery, health checking, and autonomous exploration, communication targets are locked to the owner and explicitly designated Mahoraga agents such as General Mahoraga. Discovery must never message people, channels, teams, mailing lists, or contacts simply to test connectivity.

A real task may communicate with another person only when that recipient is explicitly bound by the owner's objective or an owner-configured recipient policy. Once bound, Mahoraga may execute the send without an additional routing-choice prompt when authority permits it.

Provider adapters must separate `communication.send` from discovery/read/health capabilities. A route cannot inherit send authority merely because it can read a mailbox or access Teams.

Non-human agent-to-agent coordination similarly targets stable registered agent identities rather than fuzzy names or caller-selected arbitrary recipients.
## 14. Network and Endpoint Boundary

The universal fabric is outbound-first.

Preferred transports are official provider APIs, authenticated connectors, fixed local-process MCP transports, approved relays, and attended application automation when necessary.

The fabric must not automatically create or enable:

- ngrok or equivalent public tunnels;
- reverse proxies exposing the local control plane;
- router port forwarding;
- generic inbound public listeners;
- browser DevTools / CDP debugging endpoints;
- arbitrary SOCKS / SSH tunnels;
- dynamic executable network bridges.

Local Mahoraga control remains loopback unless a separately designed owner-approved deployment boundary replaces it. This reduces endpoint-security noise while still allowing broad cloud capability coverage through normal outbound HTTPS.
## 15. Universal Action Contract

Every executable subtask uses one provider-neutral envelope before adapter translation.

Required fields should include:

- objective and work identifiers;
- canonical capability;
- target reference;
- data classification;
- authority reference and required scopes;
- idempotency key;
- input/result contract references;
- expected verification evidence;
- cost policy;
- attendance requirement when applicable;
- recovery / compensation semantics;
- correlation lineage.

Provider adapters translate this envelope into native calls and normalize native responses back into typed Mahoraga receipts. Provider-specific payloads remain behind the adapter boundary.

This contract prevents the planner from learning provider quirks and makes route substitution possible without changing the user's objective.
## 16. Verification, Learning, and Route Memory

Execution success is established by capability-specific evidence rather than by a provider saying only that a request was accepted.

Receipts should capture bounded metadata such as provider/worker identity, capability, target fingerprint, status, timing, cost classification, verification method, and result/artifact references. Private task content remains outside operational receipts unless explicitly required by the content system.

Verified outcomes update route statistics:

- success / failure count;
- recent failure class;
- observed latency;
- rate-limit or quota condition;
- last successful canary;
- recovery success;
- cost observation where available.

This memory influences future ranking but never overrides current authorization, data-class, or health constraints.

Repeated failures may temporarily quarantine a route while alternatives continue the objective. Fresh successful health/canary evidence can automatically restore it.
## 17. Cost Semantics

Capability discovery, graph construction, route scoring, health reconciliation, and deterministic recovery planning should remain zero-model-credit operations.

A route may still represent a licensed or metered execution provider. Its execution cost classification is separate from the cost of deciding whether to use it.

Mahoraga may automatically use already-authorized subscription/licensed routes when owner policy permits them. Metered or separately billed routes require the applicable owner spending policy or ceiling; the fabric must not disguise a metered action as a free fallback.

Quota exhaustion is a route-health/economic condition, not a code defect. The router should deprioritize or suspend the exhausted route and continue through compatible alternatives without generating wasteful retry traffic.
## 18. Implementation Increments

### Increment U1 — Capability Graph v2

Extend the existing graph/registry with authority requirements, identity fingerprints, idempotency, recovery, cost observations, and dynamic route-state metadata while preserving deterministic serialization and backward migration from v1.

### Increment U2 — Adaptive Delegated Work Fabric

Upgrade `delegated-work-fabric.mjs` and routing so an unavailable first choice can transparently select another compatible route. Add resumable authentication waits and a failure taxonomy that distinguishes terminal policy denial from recoverable provider unavailability.

### Increment U3 — Discovery and Admission

Add trusted discovery adapters for installed/connected providers and reconcile them into runtime graph state. Discovery remains metadata-oriented and does not invoke generative models for ordinary health detection.

### Increment U4 — Microsoft Native Family

Split the current `microsoft365` worker into capability routes for Graph operations, Microsoft 365 Copilot reasoning, General Mahoraga / Copilot Studio delegation, and attended app fallback. Preserve official outbound HTTPS only.

### Increment U5 — Capability Acquisition

When no route exists, permit owner-authorized configuration/provisioning or isolated adapter-candidate generation, verification, canarying, registration, and activation through existing self-evolution machinery.
## 19. Acceptance Criteria

The fabric is successful when all of the following are demonstrated:

- one owner request can compile into multiple capability subtasks without exposing provider choice;
- at least two providers can satisfy the same normalized capability and route substitution is automatic;
- a failed/unavailable preferred route does not terminate an objective when a compatible authorized alternative exists;
- authentication-required work pauses and resumes the same objective after authorization;
- authority is evaluated at execution time for every privileged route;
- data-class incompatibility prevents routing even when a provider is otherwise healthy;
- route ranking responds to verified reliability, latency, workload, quota, and cost evidence;
- provider switching cannot duplicate non-idempotent actions;
- discovery cannot grant itself permissions or create an arbitrary executable transport;
- Microsoft reasoning/action/agent routes can switch invisibly behind one Mahoraga conversation;
- development connectivity checks cannot message arbitrary people or channels;
- no universal-coverage feature requires a public tunnel, port forward, reverse proxy, or browser debugging endpoint;
- full repository verification remains green and release-baseline/self-repair coverage includes new production modules.

## 20. Relationship to Owner-Sovereign Authority

The Universal Capability Fabric consumes the owner-authority resolver created by the Owner-Sovereign Copilot Studio design. It does not replace or widen that grant implicitly.

Universal coverage expands **available capability**, not fabricated authority. Effective execution remains:

`owner grant ∩ actual platform permission ∩ exact registered capability`

The fabric's aggressive behavior is therefore expressed through discovery, substitution, recovery, provisioning, self-repair, and adaptive routing—not by ignoring external authorization.