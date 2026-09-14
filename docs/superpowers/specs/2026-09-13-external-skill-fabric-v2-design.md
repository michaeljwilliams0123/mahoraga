# External Skill Fabric v2 Design

**Status:** Owner-approved implementation scope

## Objective

Add Wolfram, AI Roleplay Chat Simulator, edX, and Transkriptor to Mahoraga as bounded capability providers inside the existing Universal Capability Fabric (UCF). They are provider routes, not separate brains, planners, memory stores, or authority planes.

## Capability families

- Wolfram: `compute.query`, `compute.context`, `compute.evaluate`.
- AI Roleplay: `training.start`, `training.turn`, with Mahoraga-owned debrief/evaluation state.
- edX: `learning.search`, `learning.details`, `learning.compare`.
- Transkriptor: `speech.transcript.list`, `speech.transcript.read`, `speech.summary`, `speech.transcript.export`, `speech.quota`.

The current Transkriptor connector is transcript-library access only. This change must not claim that live audio transcription exists.

## Authority and cost

Every provider stays fail-closed. Connected/configured does not mean routable. Provider routes require the existing Mahoraga authority, data-class, readiness, quota/cost, and canary gates.

No provider receives repository write, deployment, human communication, arbitrary filesystem, or secret access by default. Wolfram Language evaluation is privileged code execution and must never be selected silently for ordinary chat.

Zero-incremental-cost remains the default. No paid or metered fallback is introduced by this feature.

## Conversation behavior

Mahoraga remains the one owner-facing conversation. The conversation planner may select an external skill only for domain-matching requests and only when the route is admitted.

The change also corrects routing regressions found by the 20-turn live test:

- content-generation requests such as `write`, `design`, `propose`, or `build a framework` are answers unless they explicitly request mutation of Mahoraga/repository/external state;
- explicit `do not change/modify/implement` wording prevents action escalation;
- conversation-history questions such as `what was my previous question?` stay on the answer lane rather than inheriting the prior operational capability;
- deterministic health/status commands continue to execute as tasks.

## Provider transport truth

ChatGPT app connections are not automatically exportable to the standalone Mahoraga runtime. The runtime must therefore distinguish provider registration from provider transport availability. A provider with no callable Mahoraga transport is visible as configured/unavailable, not healthy and not executable.

The existing MCP host remains the provider boundary. This slice may add provider capability aliases/readiness metadata, but it must not invent credentials, endpoints, or successful execution evidence.

## Verification

Use TDD. Add focused planner/intake tests for the four capability families and the routing regressions above. Add MCP/provider readiness tests proving missing transport fails closed. Preserve release-baseline parity for runtime source changes. Run focused tests, `git diff --check`, and the full `npm run verify`; protected-main merge still requires exact-head Ubuntu and Windows Verify.
