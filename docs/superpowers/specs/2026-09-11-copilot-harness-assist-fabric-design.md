# Copilot Harness Assist Fabric — Design

**Status:** Architecture approved in conversation; written spec for owner review before implementation.

**Date:** 2026-09-11

**Foundation:** PR #293 (Power Platform UCF provider family) and PR #289 (Universal Capability Fabric).

## 1. Objective

Extend Mahoraga's Universal Capability Fabric so Microsoft Copilot Studio agents powered by the GitHub Copilot harness can be discovered, understood, ranked, delegated to, evaluated, and learned from as specialist workers without becoming a second brain or bypassing Mahoraga's authority, cost, verification, and mutation boundaries.

The owner continues to use one Mahoraga conversation. Harness selection, agent selection, connected-agent topology, model choice, tool/skill availability, memory capability, evaluation evidence, monitoring evidence, and cost admission remain behind the scenes.

This design is a continuation of #293. It does not replace the Power Platform provider family or General Mahoraga standard-harness path.

## 2. Microsoft Source of Record

Primary reference: https://learn.microsoft.com/en-us/microsoft-copilot-studio/agents-experience/overview

Related Microsoft Learn references used by this design include harness selection, connected agents, tools, skills, model selection, memory, preview/testing, evaluation, and billing guidance.

The GitHub Copilot harness is treated as a distinct runtime from the standard harness and Copilot chat harness. Harness identity is therefore explicit provider metadata and never inferred from agent display names.
## 3. Architectural Principle

Mahoraga remains the canonical planner, authority resolver, cost resolver, verifier, and mutation owner.

Copilot harness agents are provider-side specialists that may contribute reasoning, research, analysis, workflow design, document work, validation, or mutation candidates. Their output is evidence for Mahoraga, not authority over Mahoraga.

The canonical chain remains:

`Owner intent -> UCF planner -> authority/data/cost resolver -> provider route -> execution -> normalized receipt -> Mahoraga verifier -> continue objective`

For repository changes, the chain remains:

`specialist output -> mutation candidate -> bounded builder -> exact verification -> integration policy`

No Copilot harness agent receives unrestricted direct write access to Mahoraga source merely because it can reason over the repository or use GitHub tools.

## 4. Harness-Aware Provider Model

UCF gains an explicit Microsoft harness dimension:

- `standard-harness`: predictable/topic-oriented Copilot Studio agents such as the current General Mahoraga path;
- `copilot-chat-harness`: Microsoft 365 Copilot Chat extensions and enterprise knowledge routes;
- `github-copilot-harness`: reasoning-heavy, multistep agents with tools, skills, connected agents, memory, model selection, evaluation, monitoring, and secure task execution.

Harnesses may expose overlapping normalized capabilities, but they remain separate execution routes with separate billing, health, and evidence.
## 5. Harness Capability Descriptor

Each discovered harness agent is projected into UCF as a bounded descriptor containing only routing-relevant metadata:

- stable logical agent alias and harness type;
- owner/environment binding fingerprint, never raw tenant credentials;
- published/available/connectable state;
- normalized capability classes;
- instructions fingerprint and bounded behavioral summary;
- knowledge-source categories, not copied knowledge content;
- tool and MCP capability summaries;
- skill names/descriptions and version fingerprints;
- connected-agent edges with bounded delegation depth;
- selected model class and production/preview status;
- memory enabled/disabled and memory policy metadata;
- evaluation summary and last evaluation timestamp;
- monitoring/health/recent-success metadata;
- authority scopes and data classes;
- billing class and zero-credit eligibility;
- recent latency/reliability observations.

Raw prompts, knowledge documents, memory files, tokens, tenant IDs, agent GUIDs, conversation transcripts, and provider secrets do not enter the capability graph or Git.

## 6. Instructions and Knowledge

Microsoft instructions define agent identity, behavior, and boundaries. Mahoraga may inspect a bounded description or hash for drift detection and routing fitness but does not mirror full private instructions into operational receipts.

Knowledge sources are modeled as capability evidence such as `m365-enterprise`, `sharepoint`, `dataverse`, `web`, or approved custom sources. Mahoraga does not copy enterprise knowledge into Git simply to make it routable.

A route can be preferred when its knowledge domain matches the objective, but knowledge access never widens owner/platform authority.
## 7. Tools, MCP, and Skills

Microsoft tools may call APIs, connectors, automated flows, external services, and MCP servers. UCF should ingest their names, descriptions, and bounded input/output contracts as capability metadata because tool descriptions materially influence orchestration quality.

Skills are reusable structured behaviors. A skill becomes a routable sub-capability only after its descriptor passes schema, authority, data-class, and cost admission. Skill files may be versioned or fingerprinted, but private runtime content is not copied into Git without an explicit repository purpose.

Mahoraga never assumes that an agent possessing a tool grants Mahoraga direct access to that tool. Direct execution requires its own registered adapter and authority. Otherwise the tool remains available only behind the provider agent boundary.

MCP routes preserve the existing Mahoraga rule: fixed validated transports are allowed; caller-selected executable paths, arbitrary proxy destinations, and undeclared generic shells are not inferred from tool metadata.

## 8. Connected Agents

Connected agents become explicit directed edges in UCF. Each edge records the primary logical agent, specialist logical agent, capability description, health, harness type, data class, and cost class.

Mahoraga may choose either to delegate to the primary agent and allow Microsoft orchestration to choose a connected specialist, or to call an independently registered specialist route when a supported provider interface exposes it.

Fan-out and recursion are bounded. Default orchestration must prevent unbounded agent-to-agent loops, duplicate model work, and "ask every agent" behavior. A connected-agent result returns to the same Mahoraga objective lineage and idempotency chain.

During development, connected-agent communication is restricted to registered Mahoraga/Copilot specialist identities; it never expands into human messaging or Teams-channel broadcast authority.
## 9. Model Selection

The selected Copilot harness model is route metadata, not a Mahoraga objective. UCF may use model class, reasoning depth, latency, production/preview status, and verified outcomes when ranking equivalent agent routes.

Mahoraga does not automatically switch an agent to a preview or experimental model merely because it is newer. Model mutation requires an authorized provider-management capability plus policy permitting the target model class.

Production routing should favor generally available models unless the owner explicitly admits preview/experimental models and the tenant permits the associated data-region and governance settings.

## 10. Memory Federation

Copilot harness memory is treated as provider-managed, per-user contextual memory. It is not Mahoraga's canonical objective/history memory.

When memory is enabled for an agent, UCF records only that memory is available and any bounded policy metadata exposed by Microsoft. Raw Microsoft-managed memory files are not copied into Git, route receipts, or Mahoraga's operational memory store.

Mahoraga may use a memory-enabled specialist when persistent Microsoft-side context improves task fitness, while preserving its own conversation/objective state as the source of continuity across providers.

Revoking or disabling provider memory must not corrupt Mahoraga's own state; the route simply loses that contextual feature and is reranked accordingly.

## 11. Evaluation and Monitoring

Microsoft's Evaluate surface provides repeatable test sets and quality measurements. Mahoraga should ingest existing evaluation summaries as route-quality evidence when available, rather than automatically running paid evaluations.

Evaluation metadata may include test-set identity fingerprint, method, score/pass state, timestamp, model class, expected capability use, and regression trend. Test prompts/responses remain provider-side unless explicitly imported for a repository regression purpose.

Monitor/Preview evidence may contribute bounded task-success, latency, tool-use, failure-class, and model metadata. Mahoraga must not store full private activity traces merely to rank a route.
## 12. Cost Firewall

GitHub Copilot harness use is consumption-based. Microsoft documents building, testing, evaluating, and runtime use of these agents as potentially consuming Copilot Credits.

UCF therefore uses four explicit billing classes for this provider family:

- `deterministic-zero` — metadata discovery, static parsing, local graph projection, and other non-model operations;
- `license-included` — only when Microsoft/runtime evidence proves the exact route is covered by an existing license;
- `metered-copilot-credit` — GitHub Copilot harness execution/build/test/evaluation or other known credit-consuming operations;
- `unknown` — route cost has not been proven.

Under the owner's current default policy, only `deterministic-zero` and `license-included` routes execute automatically. `metered-copilot-credit` and `unknown` routes remain discoverable, rankable, and diagnosable but non-executable.

No provider response, task field, agent description, or model prompt may self-declare a route free. Billing admission is runtime/provider evidence owned by Mahoraga's routing boundary.

## 13. Harness Discovery Without Spend

The first implementation phase is read-only discovery and metadata normalization. It should use Power Platform/PAC/provider metadata surfaces that do not invoke the harness model.

Discovery determines which harness agents exist, whether they are published/connectable, and which bounded components are visible without triggering Preview, Evaluate, agent execution, or model-backed authoring.

If Microsoft exposes a field only through a metered operation, Mahoraga records that field as unknown rather than spending credits to complete inventory.
## 14. Delegation and Mutation Boundary

When a metered harness route is later admitted by an explicit spending policy, Mahoraga may delegate bounded specialist work such as reasoning, research, document analysis, workflow design, validation, or mutation-candidate generation.

The delegation envelope includes objective reference, logical role, bounded prompt/context reference, accepted data class, authority reference, idempotency key, expected result contract, and billing policy. It does not include caller-selected raw agent IDs, arbitrary recipient addresses, shell commands, or unrestricted repository credentials.

Harness output is normalized into evidence or a mutation candidate. Source changes still flow through Mahoraga's isolated builder, exact-head verification, and integration policy. A harness agent cannot directly merge, publish, or deploy merely because its tools could theoretically perform those actions.

A validation specialist may disagree with another agent, but Mahoraga remains the final result owner and resolves conflicts using evidence, verification status, route quality, and objective requirements.

## 15. Zero-Credit Learning Loop

Mahoraga can become smarter about the harness without invoking it. Discovery snapshots, component changes, published state, tool/skill inventory, connected-agent topology, model configuration, and existing evaluation/monitoring summaries can update route metadata and capability coverage.

This learning loop is deterministic and zero-model-credit. It may reprioritize routes, identify capability gaps, recommend agent configuration changes, and prepare mutation/configuration candidates without executing a paid harness turn.

Actual provider-side edits to GitHub Copilot harness agents are separate capabilities with their own cost and authority classification. Under zero-credit policy, Mahoraga may prepare the change but does not perform a metered build/test/evaluation action automatically.

## 16. Relationship to #293

PR #293 established the Power Platform/Copilot Studio provider-family design and direct standard-harness connectivity path. This design extends that provider family with harness-aware discovery and specialist routing.

The existing `power-platform` discovery worker remains the metadata entry point. Standard-harness `studio.delegate` and GitHub-Copilot-harness delegation are distinct route classes even when they reside in the same Power Platform environment.

Existing PAC/OS-profile authentication, sanitized agent aliases, owner/platform/capability scope intersection, zero-credit billing admission, and fixed private-health checks are reused rather than reimplemented.
## 17. Implementation Increments

### H1 — Harness discovery descriptor

Extend Power Platform discovery to identify harness type and build a sanitized harness descriptor with logical alias, publish/connect state, component summaries, billing class, and evidence freshness. No harness model execution occurs.

### H2 — UCF harness topology

Project tools, skills, connected-agent edges, model metadata, knowledge categories, and memory availability into the capability graph. Add bounded fan-out/recursion controls and separate standard/chat/GitHub harness route classes.

### H3 — Evaluation and monitoring evidence

Ingest existing evaluation and monitor summaries without automatically running paid evaluations. Feed verified quality/reliability evidence into UCF scoring and quarantine/recovery decisions.

### H4 — Provider-management candidates

Allow Mahoraga to propose instruction/tool/skill/model/connected-agent configuration changes as reviewable provider mutation candidates. Execution remains blocked when the operation is metered or the platform grant is absent.

### H5 — Optional metered delegation

Only after an explicit owner spending policy admits `metered-copilot-credit`, enable bounded harness delegation. Normalize outputs into evidence/mutation candidates and keep Mahoraga's builder/verifier/integration boundary authoritative.

## 18. Network and Human-Communication Boundary

Harness integration prefers official Power Platform/Copilot Studio APIs and authenticated provider surfaces. It does not require a public tunnel for discovery or normal delegation.

An optional authenticated relay/tunnel may be added in a separately reviewed transport increment when an inbound callback cannot be satisfied otherwise. Such transport never implies generic proxy or arbitrary forwarding authority.

Discovery, testing of local contracts, and provider health cannot message arbitrary people, Teams channels, groups, or mailing lists. Agent communication targets registered non-human Mahoraga/Copilot identities unless the owner's actual objective explicitly binds a human recipient.
## 19. Acceptance Criteria

This design is successful when:

- Mahoraga can distinguish standard, Copilot chat, and GitHub Copilot harness agents in the same environment;
- harness discovery runs without invoking a model or consuming Copilot Credits;
- UCF receives sanitized instructions/knowledge/tools/skills/model/connected-agent/memory/evaluation/monitor metadata sufficient for routing;
- raw tenant IDs, user identity, agent GUIDs, tokens, private knowledge, memory files, and transcripts do not enter Git or routing receipts;
- connected-agent topology is bounded and cannot recurse or fan out without limits;
- GitHub Copilot harness execution is classified `metered-copilot-credit` unless runtime evidence proves otherwise;
- zero-credit policy blocks metered/unknown execution while still allowing discovery and route analysis;
- existing evaluation/monitoring evidence can influence route quality without triggering a paid evaluation;
- preview/experimental model selection cannot silently become production policy;
- specialist output cannot bypass Mahoraga's builder/verifier/integration boundary;
- development connectivity cannot message arbitrary humans or channels;
- the existing Power Platform/General Mahoraga path from #293 remains compatible;
- full repository verification and release-baseline/self-repair coverage remain green.

## 20. Non-Goals

This increment does not make the GitHub Copilot harness Mahoraga's canonical brain, does not enable paid execution by default, does not clone Microsoft-managed memory into Mahoraga, does not give provider agents unrestricted repository writes, and does not replace UCF with Microsoft's orchestrator.

It also does not promise that every Build-tab component is available through a stable public API. Unsupported metadata remains unknown until Microsoft exposes an authorized interface.

## 21. Merge Strategy

The harness-assist implementation should land as the continuation of the #293 Power Platform/UCF line. The branch may be prepared for merge automatically after implementation, full verification, and exact-head protected checks are green.

Actual landing remains exact-head bound: a changed head invalidates prior verification and requires a new readiness check before merge.
## 22. Microsoft Learn References

- Harness overview: https://learn.microsoft.com/en-us/microsoft-copilot-studio/agents-experience/overview
- Harness selection: https://learn.microsoft.com/en-us/microsoft-copilot-studio/harnesses-overview
- Connected agents: https://learn.microsoft.com/en-us/microsoft-copilot-studio/agents-experience/add-agent-connected
- Tools: https://learn.microsoft.com/en-us/microsoft-copilot-studio/agents-experience/tools-overview
- Skills: https://learn.microsoft.com/en-us/microsoft-copilot-studio/agents-experience/skills-create
- Model selection: https://learn.microsoft.com/en-us/microsoft-copilot-studio/agents-experience/authoring-select-agent-model
- Memory: https://learn.microsoft.com/en-us/microsoft-copilot-studio/agents-experience/memory-overview
- Preview/testing: https://learn.microsoft.com/en-us/microsoft-copilot-studio/agents-experience/preview-overview
- Evaluation: https://learn.microsoft.com/en-us/microsoft-copilot-studio/agents-experience/analytics-agent-evaluation-intro

These references describe rapidly evolving Copilot Studio functionality. Mahoraga should treat provider metadata/API availability as runtime-discovered evidence and fail closed when a documented feature lacks an authorized machine interface.