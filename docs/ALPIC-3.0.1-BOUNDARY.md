# Alpic 3.0.1 boundary and idempotent submission

`3.0.1` is Mahoraga's deployed cloud-control-plane release identifier. The
Alpic project is the hosting and deployment container for that MCP server: it
binds source repository, branch, runtime, environments, deployments, logs, and
the public `alpic.live` MCP URL. It is not itself Mahoraga's durable task queue.

The current production endpoint is intentionally a public, read-only MCP plane
with five audited health and identity tools. It has no mutation tools, no
desktop tunnel, and no shared execution credential. Alpic routes MCP protocol
traffic and standard authentication endpoints; arbitrary custom REST paths are
not an exposed application surface. Therefore `/submit`, `/lease`, `/complete`,
and `/check` must not be assumed to exist behind the 3.0.1 URL.

Alpic project-management authentication is also separate from task-relay
authentication. `ALPIC_API_KEY` or Alpic browser login may manage projects and
deployments, but those credentials must never become a Mahoraga task credential
or enter Git. If a later Alpic release owns the relay, it must expose explicit
authenticated MCP tools backed by durable external state:

| Logical operation | Required behavior |
| --- | --- |
| `task_submit` | Authenticate, validate a bounded request, and create or return exactly one task for its idempotency key. |
| `task_lease` | Atomically assign one eligible task with a bounded expiry and attempt count. |
| `task_complete` | Accept completion only from the active lease and record bounded evidence. |
| `task_check` | Return status and bounded receipts without exposing secrets or private conversations. |

## Idempotency contract

An idempotency key identifies one immutable logical request, not merely one
database row. Repeating the same key and the same normalized request returns the
original task. Reusing that key with a different capability, outcome, execution
plane, conversation, task area, retry policy, or other request field fails as a
conflict. This prevents a retry from silently receiving the result of unrelated
work.

The local runtime now enforces this identity check and avoids creating a second
conversation before resolving an API retry. The GitHub Codex lane independently
binds its idempotency marker to the immutable task and base commit. Together
these rules provide safe retry behavior while the Alpic 3.0.1 plane remains
read-only.

## Current responsibility split

- Alpic 3.0.1: public read-only MCP health and identity surface.
- Local Mahoraga runtime: authenticated localhost API, SQLite idempotency,
  leases, completion, recovery, and receipts.
- GitHub: authenticated bidirectional Codex coordination and durable audit
  trail, with each machine polling outbound through its own credentials.
- Dataverse: declared durable enterprise queue; activation remains separate
  from the Alpic read plane.

References: [Alpic project API](https://docs.alpic.ai/api-reference/projects/create-a-project),
[Alpic authentication](https://docs.alpic.ai/secure/auth/overview), and
[Alpic routing/troubleshooting](https://docs.alpic.ai/troubleshooting).
