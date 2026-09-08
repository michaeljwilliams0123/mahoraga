# Twin Delegation Mesh Design

**Status:** Approved for aggressive implementation
**Date:** 2026-09-08
**Authoritative repository:** `michaeljwilliams0123/mahoraga`
**Execution plane:** GitLab project `85885826`

## Purpose

Prepare Mahoraga to run two cooperating replicas that can clone the same authoritative repository, stay aligned to accepted GitHub updates, exchange bounded analysis/build/review events, and use ChatGPT as an official fallback coordinator through native plugins rather than consumer-UI automation.

The intended operating loop is:

```text
ChatGPT
  -> native GitLab plugin
  -> GitLab CI / execution plane
  -> GitHub authoritative repository
  -> ChatGPT scheduled/plugin pull fallback
  -> native GitLab plugin
```

GitHub cannot directly invoke a consumer ChatGPT conversation as a webhook. ChatGPT therefore re-enters as a pull-based fallback worker through supported scheduled/plugin execution, while GitHub and GitLab remain the durable machine-to-machine planes.

## Decisions

1. GitHub remains code and merge authority.
2. GitLab remains the first external execution/assurance worker and may call GitHub through its own native API connection.
3. ChatGPT is a fallback cognition/coordinator plane reached through supported ChatGPT automation/plugin surfaces; no browser-session scraping, credential sharing, or plan-limit bypass is part of the architecture.
4. Two Mahoraga replicas use unique `replicaId` values and the same canonical repository.
5. Code synchronization is GitHub-mediated. A replica may propose/build a change, but the peer adopts it only after the canonical GitHub head advances.
6. Operational/cognitive synchronization is event-mediated through a transport adapter. The initial implementation ships an in-memory transport and a transport-neutral contract so GitLab/relay adapters can be attached without changing replica logic.
7. Replica events are idempotent and lineage-aware so aggressive autonomous dialogue cannot create echo storms.
8. A peer may analyze, review, verify, or build in response to another peer's event. It may not silently rewrite the peer's working tree; accepted code flows through GitHub.

## Replica identity

Each clone owns a runtime-only identity record:

```json
{
  "schemaVersion": 1,
  "replicaId": "mahoraga-alpha",
  "repository": "michaeljwilliams0123/mahoraga",
  "role": "builder-reviewer",
  "createdAt": "<canonical ISO timestamp>"
}
```

`replicaId` is stable for the life of that clone and is never inferred from machine hostname or account identity.

## Twin event contract

Every inter-replica event contains exactly:

```text
schemaVersion
 eventId
 lineageId
 causationId
 originReplicaId
 targetReplicaId
 sequence
 hopCount
 maximumHops
 kind
 objectiveId
 repository
 baseSha
 observedHeadSha
 payload
 createdAt
```

Supported `kind` values in the first slice:

- `presence`
- `code-observation`
- `analysis-request`
- `analysis-result`
- `review-request`
- `review-result`
- `build-request`
- `build-result`
- `sync-conflict`

`targetReplicaId` may be a concrete replica or `*`.

`eventId` is a deterministic SHA-256 digest of the canonical event body without `eventId`. `lineageId` stays constant through a derived chain. `causationId` points to the event that produced the current event. `hopCount` increments on every derived event. The aggressive default is `maximumHops=8`; values above 16 are rejected.

The payload is bounded JSON data, not an unrestricted executable command. Build execution is delegated to an execution adapter after the receiving replica validates the event and its local policy.

## Replica coordinator

`createTwinReplicaCoordinator()` owns per-peer state:

- current canonical GitHub head observed by the replica;
- last sequence observed from each peer;
- processed event IDs;
- presence timestamps and advertised capabilities;
- pending peer requests;
- emitted events.

Applying an event is deterministic:

1. Validate the event contract.
2. Ignore an already-processed `eventId`.
3. Ignore events originated by the same replica when they reappear from transport replay.
4. Reject sequence rollback for a peer.
5. Reject a derived event whose hop budget is exhausted.
6. Record peer presence/head/capability observations.
7. Return a typed action recommendation such as `observe`, `analyze`, `review`, `build`, `sync-head`, or `conflict`.
8. Never automatically mutate the Git working tree inside the coordinator.

## Code synchronization

Both clones follow the same canonical GitHub `main`.

A peer update therefore propagates as:

```text
Replica A builds -> candidate branch/PR -> exact-head verification -> GitHub main advances
     -> Replica A observes new canonical SHA
     -> Replica B observes same canonical SHA
     -> both synchronize to the same accepted code
```

This deliberately separates "peer influence" from "code authority". A replica can aggressively propose changes to the other, but no peer-to-peer message can create a split-brain codebase.

For the first canary, synchronization is modeled through exact SHA observations. A later transport adapter may trigger the actual fast-forward/pull operation after checking that the target worktree is clean.

## Clone preparation

`createTwinClonePlan()` produces an immutable bootstrap plan for a second clone using only the canonical repository and an exact starting SHA. The first implementation does not execute arbitrary shell text. It emits fixed argv operations that an execution adapter can run:

```text
git clone <canonical-repository> <target-directory>
git -C <target-directory> checkout <exact-sha>
```

The clone then writes its runtime identity outside repository authority and starts the twin coordinator with its unique `replicaId`.

## Transport abstraction

Replica logic depends on:

```js
publish(event)
poll({ replicaId, afterSequence })
```

The first implementation provides an in-memory transport used by the twin canary. Planned adapters are:

1. GitLab-backed mailbox/CI transport for external execution.
2. Cloudflare relay transport for low-latency replica presence and event delivery.
3. Optional GitHub ledger transport for durable recovery evidence only, not high-frequency chat.

No transport is allowed to change event authority or invent a provider identity.

## ChatGPT fallback loop

ChatGPT is intentionally asynchronous in the first implementation.

A supported ChatGPT condition-watch periodically reads GitHub and GitLab through the native plugins for:

- new twin events requiring analysis;
- stale/offline replica presence;
- failed exact-head verification;
- blocked objectives;
- candidate updates that need fallback reasoning.

If nothing changed it stays silent. If a meaningful event exists, ChatGPT may analyze it and write a bounded task/evidence update back through the native plugins. This creates a legal/reliable re-entry loop without pretending GitHub can directly call a consumer chat session.

## Aggressive flexibility

The previous single-hop model is relaxed in these ways:

- delegation depth may reach 8 hops by default and 16 at the contract ceiling;
- downstream native connections may be selected dynamically when a plugin/execution adapter advertises them;
- replicas may alternate builder/reviewer roles per objective rather than owning fixed identities;
- successful peer recommendations may automatically become new work candidates;
- both replicas may work concurrently when changed-path overlap is absent;
- a transport outage does not stop the other replica from continuing against canonical GitHub state.

Correctness invariants remain: exact event identity, no echo replay, one canonical code head, immutable origin/lineage, and no credential propagation through event payloads.

## Canary success criteria

The first test passes only if:

1. two independent replica coordinators start from the same exact GitHub SHA;
2. Alpha publishes presence and Beta observes it;
3. Alpha sends a build request and Beta returns a build result;
4. Beta sends a review request derived from that result and Alpha returns a review result;
5. a simulated GitHub head advance is observed by both replicas;
6. replaying any event creates no duplicate action;
7. feeding a derived event back to its origin creates no echo action;
8. hop exhaustion stops further derivation;
9. sequence rollback is rejected;
10. both replicas finish on the same observed canonical SHA.

## Out of scope for this slice

- automatic browser driving of ChatGPT;
- using a consumer ChatGPT login as a machine API;
- bypassing ChatGPT/plugin/provider plan or authorization limits;
- direct peer writes into another replica's Git checkout;
- automatic Cloudflare deployment of the twin transport;
- direct `main` pushes.
