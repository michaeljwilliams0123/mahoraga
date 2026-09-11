# Live Brain Workspace — Design

**Status:** Owner-approved architectural invariant captured from conversation.

**Date:** 2026-09-10

## Objective

Mahoraga's workspace is a live, truthful projection of the running Mahoraga runtime. It must never become a static dashboard, a second routing brain, or a prerecorded simulation of intelligence.

The runtime owns cognition state. The UI observes cognition state.

## Governing invariant

```text
real task
  -> classify
  -> observe context
  -> adaptive route
  -> execute
  -> validate
  -> calculate reward
  -> update policy
  -> update episodic memory
  -> publish runtime state
  -> UI reflects the new brain state
```

The browser does not contain an authoritative routing policy or authoritative agent roster. It renders bounded runtime state and runtime events.

## Runtime-derived topology

The active agent/worker topology is discovered from the running Mahoraga runtime rather than compiled into frontend constants.

Adding, removing, quarantining, recovering, replacing, or dynamically discovering a worker/agent must change the visible brain without a frontend rebuild.

The runtime projection should expose bounded metadata only, including:

- stable worker/agent ID and display label;
- current availability and health state;
- registered capabilities;
- execution plane/provider family;
- quarantine/recovery state;
- current routability;
- current learned preference/ranking state when such learning state is actually produced by the runtime;
- freshness timestamp/version/cursor.

No frontend constant may define the authoritative agent roster.

## Real Pulse activity

Pulse activity must be driven by real runtime events. Relevant event classes include classification, context observation, candidate ranking, route selection, exploration/exploitation choice, execution start, verification, completion/failure, reward publication, policy update, memory update, quarantine, recovery, and topology changes.

The UI may simplify or group events for presentation, but every non-ambient Pulse event must map to an authoritative runtime event or receipt.

The UI must not manufacture successful tasks, failed tasks, rewards, route decisions, exploration decisions, learning observations, or model/tool execution.

## Continuous adaptation

Completed real tasks remain eligible to influence future routing through Mahoraga's actual learning/routing-memory path. The UI refreshes that state and changes only because the runtime state changed.

Expected visible effects include:

```text
agent improves      -> preference can rise
agent degrades      -> preference can decay
agent fails health  -> node becomes unavailable
agent recovers      -> node returns dynamically
new agent appears   -> topology expands automatically
agent is removed    -> topology contracts automatically
drift is detected   -> changed policy becomes visible
new reward arrives  -> learned state is reflected
```

If a learning primitive such as LinUCB is not present in the authoritative runtime, the UI must not pretend that it exists. The UI displays only runtime-emitted learning state. Any future LinUCB matrices or equivalent policy state remain runtime-owned and must not be mutated by presentation code.

## Quiet-state behavior

When no real task is active, the UI may render low-intensity ambient circulation so the workspace feels alive.

Ambient circulation is visualization only. Its destination may be sampled from the latest runtime-published learned weights or route ranking so visual patterns naturally follow the brain's last known state.

Ambient visualization MUST NOT:

- write a routing observation;
- alter any policy/learning matrix;
- modify episodic memory;
- increment real task statistics;
- manufacture pass/fail state;
- manufacture reward;
- represent itself as actual inference or tool execution;
- call a model merely to animate the UI.

Ambient events must be locally marked `visualizationOnly: true` and never be posted back to the runtime.

## Connection resilience

The workspace continuously attempts to observe its configured runtime using bounded reconnect/backoff behavior.

A temporary connection loss preserves the last known topology and marks it stale. Once connectivity returns, the UI reconciles against a fresh authoritative snapshot and resumes real events without a full page reload.

A disconnected runtime must never be disguised with synthetic live intelligence.

Connection states are explicit:

- `LIVE` — runtime connected and current real events are flowing;
- `QUIET` — runtime connected with no current task;
- `RECONNECT` — transport temporarily unavailable and bounded reconnect is in progress;
- `STALE` — last-known authoritative runtime state is displayed but freshness has expired;
- `OFFLINE` — no authoritative runtime state is available.

Connection state is a transport/observation fact, not a claim about model intelligence.

## Observation contract

The preferred browser observation contract is a small read-only runtime projection plus cursor-based event polling/replay over the existing authenticated runtime transport.

The projection must include:

- generated/freshness timestamp;
- runtime identity/version;
- dynamic workers/agents;
- current capability/routability metadata;
- current task/objective counts;
- current routing-memory/learning summary if available;
- latest authoritative event cursor.

The event feed must be cursor-based and idempotent. Reconnect resumes after the last applied cursor and then reconciles with a fresh snapshot so event loss or duplication cannot silently corrupt the display.

Presentation code may derive layout, animation intensity, labels, and visual grouping from this data. It may not write routing or learning state.

## Relationship to existing Mahoraga contracts

This design extends the existing Universal Capability Fabric, workspace operations snapshot, conversation gateway, relay transport, SQLite event ledger, and runtime-owned routing model. It does not create a new planner, router, or authority system.

The existing browser `RuntimeRelay` already supports runtime capabilities and operations snapshots. The local relay protocol already has a cursor-based `events` action for run events. The implementation should reuse those boundaries instead of creating a second transport.

## Deployment implication

A full live-brain workspace requires a transport that can reach the authoritative runtime. Static hosting may serve presentation assets only if the browser can still attach to the authenticated runtime/relay.

GitHub Pages cannot host same-origin dynamic Next.js API routes such as `/api/runtime/action`. Therefore the product must not interpret a successful static Pages export as proof that the brain is connected. Source verification, UI deployment, runtime liveness, and live-brain attachment are distinct facts.

A dynamic same-origin deployment of the existing `cloud-app/` plus control plane is the preferred always-on production shape. A static shell may remain a fallback only when it can attach to the encrypted runtime relay and reports that attachment truthfully.

## Acceptance test

1. Start Mahoraga.
2. Open the workspace.
3. Observe runtime-discovered agents/workers.
4. Execute real tasks and produce real verified outcomes/rewards when the runtime supports reward emission.
5. Verify Pulse reflects those runtime decisions/events.
6. Change a worker/agent's availability or roster membership.
7. Verify the graph adapts automatically without rebuilding the frontend.
8. Leave the system idle.
9. Verify ambient circulation continues without creating runtime events, learning updates, task statistics, pass/fail state, or rewards.
10. Resume real work.
11. Verify subsequent routing uses runtime-owned state learned before and after the idle period.
12. Interrupt runtime connectivity and verify `RECONNECT`/`STALE` appear while the last known topology remains visible.
13. Restore connectivity and verify the browser reconciles automatically to current runtime state without a page reload.

## Definition of done

The adaptive workspace is complete only when changing Mahoraga's runtime roster, health, route ranking, or actual learned routing state changes the UI without modifying or rebuilding frontend source code.

The architectural invariant is:

> **The brain owns state. The UI observes state. Real experience changes the brain. The visualization changes because the brain changed.**
