# Canonical Mahoraga Workspace — Administrative Control Plane and Extensibility Design

Date: 2026-09-06
Status: Approved architecture draft for owner review
Canonical repository: `michaeljwilliams0123/mahoraga`

## 1. Objective

Mahoraga shall expose exactly one authorized browser UI: the canonical Mahoraga workspace hosted at the configured production workspace URL, currently `https://mahoraga-cloud-workspace.vercel.app/`.

That single workspace must provide ChatGPT-style usability while also acting as Mahoraga's owner-grade administrative command center. It must combine conversation, operations, agents, plugins/connections, files/data, browser tasks, automations, activity/receipts, runtime/fleet state, repository controls, deployment controls, documentation controls, approvals, settings, and future capabilities without requiring a second UI.

The browser remains a client of the authoritative Mahoraga core. Credentials, policy authority, execution authority, and durable operational state do not move into the browser.

## 2. Canonical UI rule

There is one Mahoraga browser UI and one canonical production URL.

`cloud-app/` becomes the sole UI implementation and absorbs all still-useful operator capabilities.

The following must not be presented as alternative Mahoraga user interfaces:

- Google Workspace App surfaces
- GitHub Pages surfaces
- the standalone `operator-deck/`
- legacy local/static frontends
- Vercel preview URLs or deployment aliases
- Wix or other hosted UI experiments
- any future separate browser UI unless the owner explicitly changes this architecture

Retired UI code may remain temporarily only while functionality is being migrated, and must be clearly marked implementation-only/retired rather than user-accessible. Once capability parity is verified, duplicate UI code and stale documentation should be removed.

Repository metadata, READMEs, operator docs, deployment docs, launcher scripts, and agent instructions must all point to the canonical workspace rather than competing surfaces.

## 3. Information architecture

Use one application with integrated views, not one overloaded dashboard.

Primary navigation:

1. **Chat** — natural-language work, streaming results, task mode, attachments, approvals, citations/evidence, and direct administrative actions.
2. **Operations** — fleet/runtime health, task queues, workers, incidents, verification state, deployments, GitHub/GitLab assurance, and repair status.
3. **Agents** — parent/child agents, roles, capabilities, schedules, health, delegation, lifecycle, and audit history.
4. **Plugins & Connections** — discovery, install, authorization, permissions, health, enable/disable, update, revoke, and capability inspection.
5. **Files & Data** — connected files, uploads, datasets, generated artifacts, repository documents, and durable references.
6. **Browser** — approved browser tasks, active sessions, domains, approvals, receipts, and history.
7. **Automations** — recurring jobs, condition watches, scheduled tasks, learning cycles, and execution history.
8. **Activity & Receipts** — unified chronological ledger of reads, writes, approvals, agent actions, CI results, deployments, repairs, and rollback evidence.
9. **Settings** — workspace identity, owner policy, runtime pairing, connection policy, cost/credit policy, appearance, and extension policy.

Views are modules within the same application and same origin. Adding a capability should register navigation and controls through the workspace extension system rather than create another site.

## 4. Administrative authority model

Mahoraga uses the previously approved ChatGPT-style owner authority model.

### Routine authority

When the owner has already granted the relevant standing authority, Mahoraga may perform routine reads and writes directly from chat or the appropriate admin view. Examples include:

- repository inspection and bounded edits
- branch creation and pull/merge requests
- issue/comment/documentation updates
- CI/CD inspection and repair workflows
- deployment inspection and permitted deployment actions
- plugin installation and connection setup for confidently identified legitimate providers
- agent creation/configuration within existing owner authority
- scheduled operational work
- non-destructive fleet/runtime administration

Novelty is **not** a reason to require approval. A newly added legitimate provider, plugin type, connector, or capability is not automatically considered risky merely because Mahoraga has not used it before.

### Owner escalation

Owner escalation is driven by material uncertainty or consequence, not by the word "new".

Mahoraga asks before proceeding when one or more of the following is true:

- provider/product identity or provenance is suspicious or ambiguous
- a name/domain/package appears to impersonate or typo-squat a known provider
- the requested action is destructive, irreversible, or outside existing standing authority
- credentials or permissions would materially broaden authority beyond the owner's current policy
- a major release/core activation crosses an explicitly owner-gated boundary
- a platform/tool itself requires user confirmation

When an escalation is required, Mahoraga should prepare the action fully and ask one concise question with the exact identity, scope, consequence, and rollback information.

## 5. Provider and plugin identity trust model

Mahoraga must distinguish legitimate extensions from suspicious lookalikes without treating unfamiliarity itself as a defect.

### Confidently legitimate identity

An extension may proceed under standing authority when identity and provenance can be established through one or more strong signals such as:

- official provider domain or documented API endpoint
- verified marketplace or plugin registry publisher
- signed package/release provenance
- known organization/repository ownership
- previously approved provider identity
- authenticated OAuth application identity matching the intended provider
- package metadata whose publisher, repository, and documentation consistently identify the same provider

No manual approval is required merely because this is the first time Mahoraga has installed or connected that legitimate capability.

### Suspicious or ambiguous identity

Mahoraga must stop before installing, authenticating, sending credentials, or performing writes when identity signals indicate possible impersonation or ambiguity. Detection should include:

- typo-squatted names resembling established providers
- edit-distance/lookalike names (for example, obvious misspellings of well-known products)
- Unicode/punycode homographs
- domain mismatch between product name and official provider
- package publisher mismatch
- unsigned or unverifiable binary/package provenance where a signed/official distribution would normally exist
- conflicting repository, homepage, OAuth issuer, or publisher identities
- newly encountered credential endpoints that do not match the provider's official domains
- a private or third-party registry masquerading as an official provider source

The system should present the suspected identity and the intended known provider side-by-side and ask the owner whether to trust it.

A provider being obscure or small is not itself sufficient to block it. The trigger is uncertainty, inconsistency, impersonation risk, or requested authority—not popularity.

## 6. Extension architecture

Mahoraga supports three implementation forms while presenting them through one plugin/capability model:

### A. Core-native capability

Trusted, testable capabilities may be integrated directly into the Mahoraga core when doing so materially improves reliability, latency, routing, or system cohesion.

Core promotion requires deterministic verification and rollback capability, but does not require owner approval solely because the capability is new.

### B. Managed extension worker

Capabilities that benefit from process isolation, separate dependencies, native binaries, or independent lifecycle may run as Mahoraga-managed workers. They register the same manifest and capability interfaces as core-native features.

### C. Remote connector/plugin

OAuth/API/MCP/plugin-style integrations may run remotely while declaring their capabilities, health, permissions, and action contracts to the core.

The operator should not need to care which implementation form is used during normal work. Chat and the UI address capabilities by intent and declared permissions.

## 7. Capability manifest

Every extension must expose a machine-readable manifest containing at least:

- stable provider/plugin identity
- publisher and provenance metadata
- capability names and schemas
- reads/writes/actions supported
- credential requirements
- network/domain requirements
- cost/credit behavior
- unattended-execution eligibility
- destructive/consequential action flags
- health/readiness probe
- verification profile
- rollback/disable procedure
- version/update channel
- UI contributions, if any

The core capability registry consumes the manifest and exposes eligible actions to chat, agents, automations, and UI modules.

## 8. Plugin and connection lifecycle

The default lifecycle is:

`discover -> verify identity -> install/connect -> verify capability -> enable -> observe -> update/repair -> disable/revoke`

There is no generic "new capability" approval stage.

If identity/provenance is confident and authority is within standing policy, Mahoraga proceeds automatically.

If identity is suspicious/ambiguous or requested authority exceeds standing policy, Mahoraga pauses before credentials/writes and asks the owner.

## 9. Chat-first administrative usability

Every administrative function available in a pane should also be addressable through chat when practical.

Examples:

- "Fix the failed GitLab merge and verify GitHub afterwards."
- "Install the official GitLab connection and give the repository steward routine write access."
- "Show unhealthy agents and repair what you can."
- "Deploy the verified workspace build."
- "Update every Mahoraga document so only the canonical UI is referenced."
- "Find plugins that would improve observability and equip the appropriate agents."

The UI should render structured action previews/results, status, evidence, and receipts inside the conversation rather than forcing the owner to navigate away for ordinary operations.

## 10. Operations surface

The retired operator-deck capabilities should be migrated into the canonical workspace as an Operations module, including at minimum:

- GitHub repository/branch/PR status
- GitLab assurance and repair state
- exact-head verification status
- Vercel deployment health and canonical production URL
- runtime version and paired-core state
- worker/fleet status
- scheduled self-improvement/steward cycles
- current incidents and repair attempts
- owner-write actions already supported by Mahoraga
- task/objective state and cancellation
- release/update/rollback state

PR #174 may be reused only after its accidental `globals.css` truncation is corrected and its incomplete UI work is reconciled against this specification.

## 11. Agents surface

The Agents module should expose:

- parent/child topology
- purpose/instructions
- current capabilities/plugins
- connected systems
- schedules/learning cycles
- health and recent work
- delegation graph
- ability to create, modify, pause, resume, retire, and equip agents
- inheritance/delegation of verified capabilities according to owner policy

Agents should dynamically gain access to newly installed capabilities when policy allows instead of requiring hard-coded UI changes.

## 12. Plugins & Connections surface

The canonical workspace must provide a first-class extension manager comparable to a modern plugin/app directory plus an administrative connection console.

It should support:

- installed/available/searchable extensions
- official identity/provenance display
- requested permissions
- authentication/connect flow
- health/readiness
- enable/disable/revoke
- automatic updates where allowed
- per-agent and global availability
- cost/credit policy
- recent actions and receipts
- suspicious-identity warning flow
- custom MCP/API/plugin registration
- owner-authored local/private extensions

The system should be extensible enough that future categories do not require a redesign of the workspace shell.

## 13. Files, data, browser, and automation parity

The workspace should continue evolving toward the practical breadth of a ChatGPT-style environment:

- uploads and generated artifacts
- connected document/file sources
- dataset analysis
- repository files
- citation/evidence display
- browser task submission and approval
- scheduled and conditional automations
- conversation/task history
- reusable agent/plugin context

These features must remain mediated by the Mahoraga core and declared capability contracts.

## 14. Security and containment boundaries

This design removes novelty-based friction; it does not discard core containment requirements.

- No raw secrets rendered in the browser.
- No credentials committed to Git.
- No ngrok, public reverse tunnel, reverse SSH, or public debugging endpoint.
- Provider identity is checked before credentials are sent.
- Core/worker/plugin actions are attributable through receipts.
- Capability declarations do not imply readiness; live health and permission evidence still matter.
- Rollback/disable remains available for core and extension updates.
- The canonical browser UI is not itself the trust root; the Mahoraga core remains authoritative.

## 15. Documentation and repository consolidation

Implementation must remove contradictions across the repository.

At completion:

- root `README.md` identifies one browser UI
- `docs/CLOUD-WORKSPACE.md` is the canonical UI architecture document
- `docs/OPERATOR-CONSOLE.md` is retired or rewritten as an Operations-module migration record, not a second UI guide
- `operator-deck/` is removed after parity, or retained only temporarily with an explicit retired/migration marker
- GitHub repository homepage points to the canonical workspace rather than GitHub Pages
- launch/open scripts open the canonical workspace
- agent/copilot instructions prohibit creation or documentation of alternate Mahoraga UIs unless the owner explicitly changes this architecture
- Google Workspace, Pages, Wix, legacy local/static, preview, and other alternate UI links are removed from user-facing documentation
- Vercel preview URLs remain deployment artifacts, never canonical navigation targets

## 16. Verification requirements

Implementation should be test-driven and include deterministic contracts covering at least:

- only one canonical browser UI/URL is documented
- no user-facing references to retired UIs remain
- navigation exposes the approved integrated modules
- routine administrative actions route through the core
- plugin identity/provenance checks distinguish legitimate providers from suspicious lookalikes
- novelty alone does not trigger approval
- ambiguous/lookalike identity blocks credentials/writes pending owner decision
- secrets are not rendered/logged
- extension manifests register capabilities dynamically
- Operations functionality replaces rather than links to a second operator UI
- exact-head GitHub/GitLab/Vercel health is represented without becoming a duplicate authority plane
- `npm run verify` in `cloud-app/` passes
- repository-wide verification passes before integration

## 17. Migration sequence

1. Correct/close or supersede incomplete PR #174 safely.
2. Establish canonical workspace shell/navigation and Operations module.
3. Migrate useful operator-deck capability contracts into `cloud-app/`.
4. Add the extension manifest/registry and Plugins & Connections module.
5. Add Agents, Activity/Receipts, Automations, Files/Data, and Browser administrative views around existing core contracts.
6. Add provider identity/provenance verification and suspicious-lookalike escalation.
7. Update repository docs, metadata, launchers, and agent instructions to the single-UI rule.
8. Remove/retire duplicate UI code only after parity verification.
9. Run focused UI/contract tests, `cloud-app` verification, full repository verification, and deployment health checks.
10. Promote only the canonical workspace production deployment and verify its canonical URL.

## 18. Success criteria

The change is complete when the owner can use one Mahoraga URL as the normal entry point for conversation and administration, can freely equip legitimate plugins/connections without novelty-based approval friction, receives an explicit warning before interacting with suspicious or ambiguous provider identities, and no repository documentation directs the owner to another Mahoraga UI.
