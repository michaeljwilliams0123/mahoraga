# Production status — 2026-08-13

## Local runtime

- Version: `3.2.0`
- Phase: `production`
- Cockpit: `http://127.0.0.1:4782`
- Runtime: live and responding
- Workers: `local-core`, `repository`, `browser`, and `self-healer`, all
  process-isolated and supervised
- Durability: SQLite WAL task store, leases, crash recovery, and bounded restarts
- Startup: current-user scheduled task `Mahoraga Production Runtime` installed
- Task contract: correlation IDs, priority, leases, maximum attempts,
  verification state, immediate crash recovery, and append-only event receipts
- Discourse: durable conversations, messages, worker questions, human wait
  state, and queue resume are enabled in Control Center `4.1.0`
- Update authority: user-only; there is no autonomous core activation route

## Microsoft production plane

- Agent: `General Mahoraga`
- Environment: `Vaco (default) (Upgrade)`
- Model: GPT-4.1
- Work IQ: enabled on 2026-08-12
- Public web search: enabled
- Knowledge sources: five ready sources observed
- Tools: three GitHub MCP tools observed
- Connected agents: Adobe, AI Learning Advisor, and Analyst observed
- Topics: Goodbye, Greeting, and Start Over observed
- Publication: forced-newest production publication completed on 2026-08-12
- Triggers: none observed

## Production-standby integrations

- LM Studio remains standby because the v2 local-reasoner worker has not yet
  been implemented. The older local-agent prototype remains available separately.
- Lenovo AI Now remains a bounded compatibility adapter, outside the critical
  production path.
- Browser Worker is production-enabled through a dedicated loopback-only Chrome
  process. Desktop Worker remains disabled pending its application allowlist.
- Dataverse is selected for the durable Microsoft task ledger. The outbound-only
  relay remains disabled until the exact Dataverse environment URL and owning
  solution are explicitly confirmed.

## Cloud read plane

- Version: `3.0.1`
- Production MCP: `https://mahoraga-cloud-contr-eea554e9.alpic.live/mcp`
- Surface: five audited read-only health and identity tools
- Public mutations and inbound device control: not exposed

This record distinguishes deployed capability from declared future capability.
