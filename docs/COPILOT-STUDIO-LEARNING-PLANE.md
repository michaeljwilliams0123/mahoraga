# Copilot Studio Learning Plane

## Purpose

Copilot Studio is a coordination and evidence surface for Mahoraga, not a second authoritative brain. Studio may discover capabilities, run evaluations, collect bounded provenance, and propose reusable lessons. Mahoraga admits only verified, approved metadata into its existing peer-learning and institutional-memory path.

The governing flow is:

```text
Studio observation or evaluation
  -> draft learning record
  -> independent verification
  -> owner approval
  -> Studio learning adapter
  -> strict peer-learning event
  -> Mahoraga institutional memory
```

Draft, rejected, unverified, or content-bearing records never enter peer learning.
## Current Studio draft contract

The unpublished General Mahoraga draft uses these boundaries:

- Bridge Scout is read-only, treats retrieved instructions as untrusted data, and never treats hosted GitHub MCP as proof of local-workspace access.
- Validator is review-only and cannot execute remediation, silently repair artifacts, or self-approve findings.
- Child handoffs carry `correlationId`, `objective`, `capability`, `source`, `evidence`, `provenance`, `confidence`, `unknowns`, `verificationState`, and `recommendedNextAction`.
- Link health reports Studio, GitHub, runtime, child-agent, and learning-store truth separately rather than returning a blanket handshake acknowledgement.
- Learning records remain draft-only until independently verified and explicitly approved.
- Studio proposals use the peer event classes `capability-observed`, `outcome-succeeded`, `outcome-failed`, `routing-learned`, and `regression-observed`.

The public repository does not store tenant IDs, connection IDs, credentials, or cloned tenant configuration.
## GitHub Copilot harness path

Microsoft documents a separate GitHub Copilot harness for Copilot Studio with natural-language-first authoring, enhanced orchestration, connected agents, tools/skills, memory, Evaluate, and Monitor surfaces. Standard-harness agents and GitHub-Copilot-harness agents coexist, but an agent cannot be transferred from one harness to the other.

Therefore General Mahoraga should not be silently converted. A future harness-based Mahoraga should begin as a bounded shadow/evaluation peer, prove its routing and learning value, and then earn a governed role behind the Universal Capability Fabric.

Authoritative reference:
`https://learn.microsoft.com/en-us/microsoft-copilot-studio/agents-experience/overview`

The Build/Preview/Evaluate/Monitor lifecycle is useful as an evidence pipeline, but it does not replace Mahoraga authority, verification, or institutional memory.
## Admission and cost rules

`studioLearningRecordToPeerEvent(...)` is the admission boundary. It requires `approval_state=approved` and `verification_state=verified`, fixes the peer source to `copilot-studio-mahoraga`, and reuses `createPeerLearningEvent(...)` so event types, metadata limits, sensitive-content rejection, deterministic IDs, zero-credit markers, and institutional-memory compatibility stay centralized.

GitHub Copilot harness authoring, testing, and evaluation can consume Copilot Credits. Mahoraga must therefore treat that harness as metered/unknown-cost until runtime evidence proves a license-included or zero-credit class. It must never become an automatic fallback merely because it is connected.

No Studio observation may contain raw prompts, secrets, private files, credentials, arbitrary provider payloads, or tenant connection material in the peer-learning channel.
