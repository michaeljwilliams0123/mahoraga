# Relay Handshake Contract — Mirrored Powers Across Surfaces

> **Status: DESIGN DRAFT.** Defines how the designer AI (this coordinator) and the builder AI
> (the repo's coding agent) hand work back and forth, with the explicit goal of **mirroring powers
> across surfaces**: what the human holds "there" they hold "here," and what an AI can legitimately
> do "here" it can do "there" — *to the extent those powers are real and transferable.* Grounded in Microsoft Learn.

## The mirror principle (your core ask)

> "Whatever power you have here, I want there; whatever power I have there, I want here."

This contract mirrors every **real, transferable** power and is honest about the few that cannot be
mirrored because no party holds them.

### Perfectly mirrored — human powers, everywhere

Your authority is identical on both surfaces:
- Author/edit agent contracts · trigger builds · review · **approve/promote** · merge · branch.
- The **Approve key** is yours on GitHub and at the Copilot Studio gate alike. Same hand, same key.

### Mirrored — AI working powers, everywhere

Both AIs get the same *working* capabilities on both surfaces (all read/propose/draft):
- Read state, draft artifacts, open draft PRs, post advisory summaries, propose next steps.
- Neither AI approves, promotes, deploys, or grants permissions on **either** surface. Symmetric.

### Cannot be mirrored — and why it's nobody's power to give

Two capabilities are held by *no party*, so they can't reflect across:
1. **Minting agent credentials / tokens** — Microsoft controls agent identities; no one in-tenant,
   including admins, can generate them. I don't have this "here," so there's nothing to mirror "there." [1]
2. **Gate-free deploy to prod** — a configured approval pauses for a human press; no surface offers a
   bypass. Not a power I hold here, so not one I can grant there. [2]

The mirror reflects *real* powers. It cannot invent one that neither side possesses.

## The handshake loop

1. **Designer AI** packages a task: goal, acceptance criteria, target env (sandbox by default), risk notes.
2. **Builder AI** implements in the sandbox, opens a draft PR, returns: what changed, tests, open questions.
3. **Designer AI** reviews builder output, refines, posts a gate-advisory summary (strengthening monitor).
4. **Human** reviews periodically and **presses Approve** to promote — the one power reserved to you, on both surfaces.
5. Loop repeats; work stacks in the sandbox until you visit the gate.

## Handoff packet (schema)

```
task_id, goal, acceptance_criteria[], target_env (default: sandbox),
inputs[], risk_notes[], returns_expected[], human_gate: true
```

## Non-goals

- ❌ Neither AI self-approves, self-promotes, or self-authorizes on any surface.
- ❌ No writes to frozen `protectedPaths`. ❌ No secrets in the packet.

## Sources
[1] learn.microsoft.com/microsoft-copilot-studio/govern-agents-identities-overview
[2] matthewdevaney.com — Configure Pre-Deployment Stage Approvals
