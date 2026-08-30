# Mahoraga execution-plane and conversation-workspace plan

**Goal:** Restore a healthy, observable execution plane and replace the public intake handoff with a fast conversation-first workspace while preserving the localhost and credential boundaries.

## Wave 1: Supervisor reliability

1. Add focused supervisor tests for spawn errors, bounded stderr capture, exit diagnostics, and stale persisted worker reconciliation.
2. Add health-aware scheduler admission so automatic repair, queue polling, and mailbox-monitor work is not created when no compatible worker is healthy.
3. Use stable task-state deduplication while scheduled work remains active so downtime cannot create an unbounded queue.
4. Surface bounded worker diagnostic metadata through existing worker status APIs without storing command lines, environment values, prompts, or credentials.
5. Restore repository evidence tests for a bound checkout and explicit unverified states.

## Wave 2: Conversation-first Pages workspace

1. Replace the GitHub intake handoff and modal with one conversational composer.
2. Infer the visible task classification locally and deterministically; do not require skill, lane, or return fields.
3. Render immediate acknowledgement, connection state, worker activity, and verification cards.
4. Keep the static page credential-free and honest: until the authenticated MCP bridge exists, it must not claim that a prompt reached localhost.
5. Update public-repository documentation and Pages security policy tests.

## Wave 3: Authenticated execution bridge

1. Add an allowlisted MCP adapter in front of the local control API.
2. Authenticate and authorize every tool call; keep the runtime bound to `127.0.0.1`.
3. Supervise the tunnel client as infrastructure, not as a generic Mahoraga worker.
4. Add browser and contract tests before enabling the bridge in the public workspace.

## Wave 4: Advanced reasoning and evaluation

1. Add an Agents SDK adapter inside selected workers with a direct fast lane and a bounded planner/challenger/verifier lane.
2. Add Structured Outputs for invisible task contracts.
3. Add latency, correctness, privacy, and security evals.
4. Benchmark gpt-oss/Harmony locally only after worker reliability and the authenticated bridge are stable.

## Verification

- Run focused tests after each red/green change.
- Run the canonical `npm run verify` before integration.
- Perform a live runtime canary and a browser smoke test before claiming production activation.
