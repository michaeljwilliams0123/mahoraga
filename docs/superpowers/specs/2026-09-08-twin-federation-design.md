# Mahoraga Twin Federation Design

**Status:** Owner-approved for aggressive implementation
**Date:** 2026-09-08

## Purpose

Prepare Mahoraga for a live two-instance test where a primary instance can create a peer clone, both instances remain linked, repository updates propagate to the peer, and either instance can ask the other to analyze, review, or build bounded candidate work.

## Architecture

GitHub remains the authoritative code and merge ledger. The existing Cloudflare relay remains the low-latency paired transport and GitLab remains the native external execution/assurance plane. Twin federation adds a transport-neutral contract above those planes so two runtime identities can exchange presence, update, and work-handoff events without treating the relay, GitLab, or ChatGPT conversation state as repository authority.

A ChatGPT fallback loop may re-enter through official user-authorized native plugins by polling GitHub/GitLab state and submitting bounded work. It is a coordinator/fallback, not a consumer-chat webhook and not a mechanism for bypassing plan or provider usage limits.

## Twin identities

A federation has exactly one `federationId` and two or more distinct `peerId` values. The initial test uses:

- `mahoraga-primary`
- `mahoraga-twin-1`

Each peer advertises a generation, repository, current commit, capabilities, and last-observed timestamp. A clone inherits product code and policy but receives a new peer identity and independent runtime state.

## Event contract

Twin events are immutable schema-versioned records with:

- `schemaVersion`
- `eventId`
- `federationId`
- `originPeerId`
- `targetPeerId` (`*` allowed for broadcast)
- `sequence`
- `kind`: `presence`, `update`, `handoff`, or `receipt`
- `repository`
- `baseCommit`
- `headCommit`
- `capability`
- `payloadDigest`
- `createdAt`

`eventId` is derived from canonical event content. A peer stores the highest accepted sequence per origin and a bounded event-id window. Duplicate or stale events are acknowledged but never re-applied, preventing echo loops.

## Update propagation

An `update` event never directly overwrites another peer. It announces an authoritative GitHub commit or candidate branch/head. The receiving peer compares its observed commit and chooses one of:

1. already-current — record receipt;
2. fast-forward eligible — fetch/update its runtime checkout;
3. divergent — create an analysis/reconciliation handoff;
4. candidate work — review or test the candidate and return a receipt.

GitHub therefore provides durable synchronization while the relay provides low-latency notification.

## Reciprocal work

Handoffs support three initial capabilities:

- `twin.analyze`
- `twin.review`
- `twin.build`

A receiving peer may inspect or build only within the task's declared repository/base/head context. Build work creates candidate commits/branches; it does not write directly to `main`. Review means independent analysis and verification evidence, not a Codex PR-review request.

## Clone preparation

The first implementation provides a deterministic clone descriptor and bootstrap bundle. Creating a clone produces a new peer identity, expected repository commit, federation metadata, and capability set. Runtime-specific credentials remain provisioned through the platform that owns them and are never copied into the descriptor.

## ChatGPT/plugin feedback loop

The supported feedback loop is:

`ChatGPT -> GitLab plugin -> GitLab CI -> GitHub -> observable repository/CI state -> ChatGPT native plugin poll`

GitHub/GitLab do not receive a hidden inbound consumer-chat endpoint. ChatGPT may be used as an authorized fallback coordinator when the native session is available, while GitHub/GitLab and runtime peers continue independently between ChatGPT checks.

## Test success criteria

The prepared test is successful when:

1. A primary descriptor can deterministically create a distinct twin descriptor.
2. Primary and twin can emit presence records with independent peer IDs.
3. An update from either peer is accepted once by the other and repeated delivery is ignored.
4. A peer can create analyze/review/build handoffs for the other.
5. A returned receipt binds the original event and resulting commit/evidence digest.
6. The same GitHub commit observed by both peers converges to `in-sync`.
7. Divergent commits produce reconciliation work rather than silent overwrite.
8. Existing relay/runtime tests remain green.

## Boundaries retained

- No direct `main` overwrite by a peer.
- No credential copying in twin descriptors/events.
- No force push or hidden privilege inheritance.
- No Codex code review.
- Vercel is not a completion requirement.
- No consumer ChatGPT UI automation intended to evade usage limits.
