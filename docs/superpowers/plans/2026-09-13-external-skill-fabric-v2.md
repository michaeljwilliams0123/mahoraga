# External Skill Fabric v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Add Wolfram, AI Roleplay Chat Simulator, edX, and Transkriptor capability awareness to Mahoraga and correct the conversation-routing regressions found in the 20-turn test.

**Architecture:** Reuse the existing conversation planner, Universal Capability Fabric, and MCP host. External app capabilities are represented separately from ordinary answer generation and remain unavailable until a real callable transport is present.

**Tech Stack:** Node.js ESM, node:test, Mahoraga UCF and MCP host.

**Spec:** `docs/superpowers/specs/2026-09-13-external-skill-fabric-v2-design.md`

## Global Constraints

- Keep one Mahoraga planner and conversation lineage.
- Keep zero-incremental-cost as the default.
- Do not report unavailable external routes as healthy or executable.
- Keep edX read-only in this slice.
- Keep Transkriptor limited to existing transcript-library operations in this slice.
- Keep Wolfram Language evaluation separate from ordinary chat.
- Preserve release-baseline parity.

### Task 1: Routing regression tests
- Update `test/chat-intake.test.mjs`.
- Update `test/conversation-capability-planner.test.mjs`.
- Add tests for coding/finance/design requests remaining on `assistant.respond` unless state mutation is explicit.
- Add a prior-question recall test.
- Add tests for compute, roleplay, learning, and transcript intent selection when matching routes exist.
- Run the focused tests and confirm the new cases fail before implementation.

### Task 2: Routing implementation
- Update `src/chat-intake.mjs` and `src/conversation-capability-planner.mjs`.
- Add a no-mutation guard for phrases such as `do not change`, `do not modify`, `do not implement`, and `without changing`.
- Require explicit system/repository mutation context before generic content verbs escalate to action.
- Keep history/recall questions on the answer lane.
- Add domain-specific capability selection for the four external app families.
- Mirror source changes to `state/release-baseline/src/` and run focused tests.

### Task 3: External skill catalog and readiness
- Create `src/external-skill-catalog.mjs` and its tests.
- Update `src/mcp-host-manager.mjs` and its tests so configured providers can report unavailable status when no transport is present instead of aborting startup.
- Keep executable tool discovery separate from configured provider metadata.
- Mirror runtime source changes to the release baseline.

### Task 4: Status projection
- Update the existing status/capability projection so the four providers can be visible as configured external skills without being reported as routable.
- Add focused tests proving unavailable providers stay unavailable.
- Mirror runtime source changes to the release baseline.

### Task 5: Verification and PR
- Run focused tests.
- Run release-baseline parity verification.
- Run `git diff --check`.
- Run full `npm run verify`.
- Open a PR to `main`.
- Merge only after exact-head Ubuntu and Windows Verify pass and the branch is current with `main`.
