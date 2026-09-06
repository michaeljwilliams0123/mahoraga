# Extension Platform and Identity Trust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Mahoraga a first-class plugin/connection platform that can freely install and equip confidently legitimate capabilities under standing owner authority, while stopping suspicious lookalike or provenance-ambiguous providers before credentials or writes are used.

**Architecture:** Extensions register one normalized manifest regardless of whether they are core-native, managed workers, MCP providers, or remote API/OAuth connections. A core-side identity verifier and extension registry own provenance decisions. Novelty is not a risk signal. The canonical workspace presents discovery, connection, permissions, health, enable/disable, update, revoke, and per-agent availability through the encrypted core relay.

**Tech Stack:** Node 24 ESM, existing `mahoraga.manifest.json`, existing MCP/provider registry contracts, existing aperture/capability routing, Next.js/TypeScript canonical workspace, Node tests.

**Spec:** `docs/superpowers/specs/2026-09-06-canonical-workspace-admin-extensibility-design.md`

## Global Constraints

- Do not require approval merely because a provider/capability is new or unfamiliar.
- Do stop before credentials, installation with execution authority, or writes when provider identity/provenance is ambiguous, inconsistent, or lookalike.
- Small/obscure providers are allowed when identity is coherently established.
- Never pass raw secrets through extension manifests, receipts, browser state, logs, Git, or SQLite plaintext.
- Core extensions must remain rollbackable and verifiable; managed workers retain process isolation when native dependencies or failure domains justify it.
- Do not create arbitrary caller-selected shell execution as a plugin mechanism.
- Existing MCP/provider/capability mechanisms should be adapted, not replaced wholesale.
- TDD for every trust decision and lifecycle transition.

---

## Task 1: Define the normalized extension manifest

**Files:**
- Create: `src/extension-manifest.mjs`
- Create: `test/extension-manifest.test.mjs`
- Modify: `mahoraga.manifest.json`

### Required normalized manifest

```js
{
  schemaVersion: 1,
  extensionId,
  displayName,
  provider: {
    canonicalName,
    publisher,
    officialDomains,
    repository,
    oauthIssuers,
    packageIdentity,
    provenance
  },
  implementation: { kind: "core" | "worker" | "remote" | "mcp", entrypoint },
  capabilities: [{ id, reads, writes, actions, destructive, unattendedEligible }],
  credentials: [{ type, audience, secretReference }],
  network: { allowedDomains },
  cost: { class, creditPolicy },
  health: { probeCapability, maximumAgeMs },
  verification: { profile },
  rollback: { strategy },
  update: { channel },
  ui: { contributions }
}
```

- [ ] Write tests rejecting unknown top-level fields, duplicate capability IDs, raw credential values, wildcard network domains by default, invalid implementation kinds, missing rollback strategy for core/worker implementations, and inconsistent provider identity fields.
- [ ] Add tests proving a first-seen but coherent provider manifest is valid; novelty must not appear in the validation decision.
- [ ] Run `node --test test/extension-manifest.test.mjs`; confirm RED.
- [ ] Implement parse/normalize functions with stable ordering and frozen output.
- [ ] Add an `extensions`/`extensionPolicy` section to `mahoraga.manifest.json` that declares schema/version policy, not installed secrets.
- [ ] Re-run focused tests.

**Acceptance:** Every extension implementation form can be represented by one secret-free machine-readable contract.

---

## Task 2: Implement provider identity and provenance verification

**Files:**
- Create: `src/provider-identity.mjs`
- Create: `test/provider-identity.test.mjs`

### Public API

```js
export function evaluateProviderIdentity({ candidate, knownProviders, evidence })
```

Return one of:

```js
{ state: "verified", confidence, reasons }
{ state: "ambiguous", confidence, reasons, suspectedProvider }
{ state: "rejected", confidence, reasons, suspectedProvider }
```

- [ ] Write table-driven tests for exact legitimate identity, first-seen legitimate identity, official-domain + matching publisher, signed package provenance, known repo organization, and matching OAuth issuer.
- [ ] Write explicit lookalike tests for `Gougle`, `GetHub`, and `Yahewh`-style names when they mimic a known provider without matching official identity evidence.
- [ ] Add tests for Unicode/punycode homographs, one-character substitutions, inserted/deleted characters, domain mismatch, package publisher mismatch, OAuth issuer mismatch, conflicting homepage/repository ownership, and unofficial credential endpoints.
- [ ] Add tests proving edit distance alone does **not** reject an obscure provider whose domain/publisher/repository are internally consistent and do not impersonate a known identity.
- [ ] Add tests proving identity comparison normalizes Unicode, case, punctuation, and public-suffix/domain boundaries before comparison.
- [ ] Run tests; confirm RED.
- [ ] Implement deterministic name/domain similarity scoring plus evidence consistency rules. Similarity raises suspicion; it is not by itself a rejection signal.
- [ ] Make credential endpoint mismatch a hard stop until owner decision when the intended provider is otherwise known.
- [ ] Ensure output contains bounded reasons only, never secret material.
- [ ] Run focused tests.

**Acceptance:** Mahoraga distinguishes legitimate first-time connections from probable impersonation without a popularity or novelty gate.

---

## Task 3: Build the core extension registry and lifecycle

**Files:**
- Create: `src/extension-registry.mjs`
- Create: `src/extension-lifecycle.mjs`
- Create: `test/extension-registry.test.mjs`
- Create: `test/extension-lifecycle.test.mjs`
- Modify: `src/router.mjs`
- Modify: `mahoraga.manifest.json`

### Registry API

```js
register(manifest, evidence)
list()
get(extensionId)
capabilities()
setEnabled(extensionId, enabled)
health(extensionId)
```

### Lifecycle states

`discovered -> identity-verified -> installed -> capability-verified -> enabled -> degraded -> disabled -> revoked`

`identity-ambiguous` is a pause state before credentials/writes, not a generic state for first-seen extensions.

- [ ] Write registry tests for stable IDs, duplicate rejection, dynamic capability publication, disabled extension removal from routable capability set, and no secret persistence.
- [ ] Write lifecycle tests proving a verified first-seen provider proceeds from discovery through enable without owner approval.
- [ ] Write lifecycle tests proving ambiguous/lookalike identity stops before `install/connect` side effects and emits an owner decision requirement.
- [ ] Write lifecycle tests for rollback/disable on failed post-install verification.
- [ ] Implement registry and lifecycle state machine.
- [ ] Integrate extension capabilities into `src/router.mjs` alongside existing manifest and MCP capability sources; preserve current readiness requirements.
- [ ] Keep installed secret references external to Git/manifest; persist only stable secret-reference identifiers if persistence is required.
- [ ] Run focused tests plus router tests.

**Acceptance:** Extensions dynamically contribute capabilities while health, enablement, and identity remain core-governed.

---

## Task 4: Adapt existing MCP/provider mechanisms into the extension registry

**Files:**
- Modify as needed after exact call-site inspection: existing MCP host/provider modules under `src/`
- Modify: `src/server.mjs`
- Modify: `test/mcp-host.test.mjs` or the repository's existing MCP host tests
- Modify: `test/extension-registry.test.mjs`

- [ ] Inventory current `mcpProviders`, MCP discovery, provider readiness, and capability registration paths from `mahoraga.manifest.json` and `src/`.
- [ ] Add a test adapter that converts an existing MCP provider declaration into the normalized extension manifest without changing its current runtime behavior.
- [ ] Implement an adapter rather than a second MCP runtime.
- [ ] Ensure MCP tools appear in the same extension/capability inventory surfaced to the workspace.
- [ ] Preserve current `routable: false` behavior for discovered tools until live readiness/permission evidence exists.
- [ ] Run existing MCP tests and new extension tests.

**Acceptance:** Existing MCP/provider features become visible through the unified extension model without regression or duplicate execution paths.

---

## Task 5: Expose extensions through the encrypted relay

**Files:**
- Modify: `src/conversation-gateway.mjs`
- Modify: `src/relay-runtime.mjs`
- Modify: `src/server.mjs`
- Modify: `cloud-app/lib/runtime-relay.ts`
- Modify: `test/conversation-gateway.test.mjs`
- Modify: `test/relay-runtime.test.mjs`
- Modify: `cloud-app/test/cloud-contract.test.mjs`

### Relay actions

- `extensions-list`
- `extension-action`
- `extension-owner-decision`

Action payloads use stable IDs such as `install`, `connect`, `enable`, `disable`, `update`, `revoke`, `assign-agent`; no shell commands.

- [ ] Add failing relay tests first for list/action dispatch, missing-handler fail-closed behavior, and attended-session propagation for consequential actions.
- [ ] Add browser contract tests proving credentials are never response fields and the UI has no direct OAuth client secret/API token storage.
- [ ] Extend gateway and runtime relay dispatch.
- [ ] Extend `RuntimeRelay` with typed list/action/owner-decision calls.
- [ ] Ensure an ambiguous identity action returns a structured owner-decision requirement before any credential exchange or external write.
- [ ] Ensure a verified legitimate identity under standing authority proceeds without a generic `new-provider` confirmation.
- [ ] Run focused relay and cloud tests.

**Acceptance:** The canonical browser can administer extensions, but identity decisions and side effects remain inside the core.

---

## Task 6: Build the Plugins & Connections module

**Files:**
- Create: `cloud-app/components/workspace/plugins-connections-view.tsx`
- Modify: `cloud-app/components/workspace/workspace-shell.tsx`
- Modify: `cloud-app/components/workspace/workspace-nav.tsx`
- Modify: `cloud-app/components/workspace.tsx`
- Modify: `cloud-app/app/globals.css`
- Modify: `cloud-app/test/cloud-contract.test.mjs`

- [ ] Add failing tests requiring `Plugins & Connections` to render inside the canonical shell and use relay extension methods.
- [ ] Implement sections for Installed, Available/Discovered, Needs Owner Decision, Degraded, Disabled/Revoked.
- [ ] Show provider identity evidence: canonical provider, publisher, official domain, repository/issuer evidence, permissions, cost class, health, and capabilities.
- [ ] Allow install/connect/enable/disable/update/revoke actions through relay calls.
- [ ] For suspicious identity, render intended provider vs observed candidate side-by-side with reasons and one owner decision control.
- [ ] Do not label legitimate first-seen providers as risky simply because they are new.
- [ ] Add per-agent availability controls as a placeholder only if the backend assignment method is already implemented; otherwise defer the UI control to the admin-modules plan rather than creating a fake button.
- [ ] Run `cd cloud-app && npm run verify`.

**Acceptance:** Mahoraga has one ChatGPT-style plugin/connection manager with aggressive legitimate extensibility and targeted anti-impersonation escalation.

---

## Task 7: Full verification and integration

- [ ] Run extension/provider/MCP focused Node tests.
- [ ] Run `cd cloud-app && npm run verify`.
- [ ] Run repository `npm run verify` once on the exact candidate head.
- [ ] Open a focused PR to `main`; note that novelty is not an approval trigger and include the identity-escalation test matrix.
- [ ] Require exact-head Ubuntu/Windows Verify green; Vercel remains observational.
- [ ] Do not request Codex review.

**Acceptance:** Dynamic extensions and identity trust land behind the existing exact-head verification boundary with no new review-credit dependency.