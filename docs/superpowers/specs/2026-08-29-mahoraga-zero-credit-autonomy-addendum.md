# Mahoraga Zero-Credit Autonomous Execution Addendum

**Status:** Approved by the owner on 2026-08-29

This addendum strengthens the Mahoraga Sovereign Reasoning and Break-Glass Administration Design. It is mandatory for every implementation phase.

## Zero-credit invariant

Normal Mahoraga operation has `creditBudget: 0`. A healthy-path objective may not route to ChatGPT Work, Codex, a paid API, or another metered model provider. Provider availability does not override the zero-credit budget.

Mahoraga records a bounded credit receipt for every objective. A normal objective is complete only when `meteredProviderCalls` and `meteredCreditsConsumed` both equal zero.

The sole exception is an active `king-admin` break-glass lease. Its use is reported separately as exceptional recovery consumption and never counted as normal autonomous operation.

## Real-task requirement

Synthetic evaluations are necessary but insufficient. Mahoraga must execute real, bounded tasks inside registered projects through deterministic and local providers.

The initial zero-credit action kernel supports:

- `project.inspect`: read bounded project metadata and allowlisted files;
- `project.patch`: apply a validated unified diff to exact allowlisted files after base-digest and path checks;
- `project.verify`: run a project-registered verification command by immutable command identifier;
- `workflow.run`: execute an owner-registered sequence of typed project actions;
- existing repository, desktop, Microsoft 365, browser, and artifact capabilities when their data-plane and attended-session requirements are satisfied.

Callers and reasoning providers cannot choose executables, arbitrary arguments, working directories, or unrestricted filesystem paths. The project registry owns those values.

Every mutating action creates a checkpoint, verifies the postcondition, records a content-free receipt, and restores the checkpoint on verification failure. A speculative reasoning candidate cannot enter the action kernel.

## Local reasoning requirement

Local reasoning is the normal generative path. It uses a transient result channel, persists no prompt or raw response, and fails closed when no verified local model is available. Model-dependent work waits rather than silently consuming cloud credits. Deterministic real tasks that do not require a model continue normally.

## Background autonomy requirement

Registered project objectives may run unattended within their data, path, command, cost, concurrency, and action contracts. They pause only for a reserved owner action, unavailable required provider, exceeded bounded budget, invalid evidence, or failed rollback guarantee.

## Acceptance additions

- A real registered-project patch-and-verify objective completes with zero metered provider calls.
- A verification failure automatically restores the prior project state.
- A normal objective cannot route to Codex even when Codex is healthy.
- An unavailable local reasoner does not block deterministic tasks and does not trigger paid fallback.
- Credit receipts prove zero normal consumption.
- `king-admin` consumption is isolated, explicit, incident-bound, and auditable.
