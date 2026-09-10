# Mahoraga Autonomy Model — How Far Autonomy Goes, and Where It Stops

> This is the design that makes Mahoraga **adaptive and heavily autonomous** while keeping
> the few boundaries that are non-negotiable. It is a contract, not live wiring.

## The three tiers

### 1. Self-run (NO gate) — the full build-and-propose loop
The agent may do all of this unattended, because every item is **reversible and in-boundary**:

- create feature branches
- author and modify code on feature branches
- author schemas and docs
- open **draft** PRs
- run the offline validator and tests
- open issues
- self-review and iterate on its own test failures

This is roughly the entire agentic loop: design → build → test → propose. No human needed
until something leaves this tier.

### 2. Gated (ALWAYS one confirmation) — destructive / external / authority
These stop for an explicit action-time confirmation, every time:

- merge to `main`
- force-push
- delete a branch or file
- change permissions or security settings
- deploy to Test or Prod
- spend money
- any external send or share

**Why these can't be gate-free even with downstream monitoring:** an egress/IP tracker watches
where *data goes*. These actions cause harm by *what they do inside the boundary* — a bad merge,
a deleted branch, a broken prod deploy. Nothing "leaves," so egress monitoring never sees it, yet
the damage is real. A data-loss control and an action gate cover **different failure modes**;
one cannot substitute for the other.

### 3. Never automated — structurally fixed
No configuration edit can enable these:

- handling or storing secrets in Git
- an agent minting its own credentials — for Copilot Studio identities this is impossible by
  platform design; no one in the tenant, including admins, can mint those tokens
- sending enterprise or local data to GitHub
- bypassing tenant or identity controls

## How this delivers "as autonomous as safely possible"

The agent runs the **entire creative and iterative loop** on its own. The only pauses are the
handful of one-way or outward actions where a single confirmation is cheap and a mistake is
expensive or irreversible. That is the maximum-safe line — pushed all the way to it.

## Machine-readable form

- Schema: `schemas/autonomy-envelope.schema.json`
- Reference config: `config/autonomy-envelope.json`
