# Source audit — 2026-08-12

## Local projects

The supplied source set contains seven healthy deterministic prototypes plus an
empty document-review folder. Their existing suites all pass:

| Project | Tests | Result | Reuse decision |
| --- | ---: | --- | --- |
| `project-mahorago` | 33 | pass | Preserve task-store and fixed-tool ideas; migrate behind workers |
| `project-mahorago-cloud-bridge` | 10 | pass | Preserve status-only localhost bridge patterns |
| `project-mahorago-control-plane` | 60 | pass | Preserve routing, evidence, relay, handoff, and improvement logic |
| `project-mahorago-excel-adapter` | 5 | pass | Preserve as a later isolated Office worker |
| `project-mahorago-lenovo-adapter` | 7 | pass | Preserve as optional bounded compatibility worker |
| `project-mahorago-local-agent` | 5 | pass | Replace the WPF host; preserve the local Responses client ideas |
| `copilot-codex-bridge-test` | 2 | pass | Retain as a narrow bridge fixture |

The projects are individually sound but collectively impose different and often
contradictory capability boundaries. V2 resolves this by declaring capability on
workers instead of making the central model either all-powerful or globally
restricted.

## Crash diagnosis

The old `Mahorago Control Center.ps1` combines the WPF UI, launcher, redirected
process streams, process lifecycle, status polling, and cancellation inside one
PowerShell process. It also sets `$ErrorActionPreference = 'Stop'` globally and
attaches PowerShell scriptblocks to asynchronous output callbacks. Any unhandled
UI event, callback/runspace failure, launch error, or timer failure can terminate
the cockpit.

V2 moves process ownership into the Node supervisor. Worker output never touches
the UI thread; the cockpit reads bounded JSON state from a localhost API. A worker
crash is recorded and restarted without taking down the control surface.

## VS Code prompt files

VS Code discovers workspace prompt files in `.github/prompts`. They are manually
invoked slash commands, and their frontmatter can select an agent and tools.
Current VS Code documentation also notes that Agent Host agents do not use prompt
files; those workflows should later be converted to agent skills when Mahoraga
targets the Agent Host.

## Copilot Studio live state

The signed-in environment showed five agents. `General Mahoraga` is published and
uses standard orchestration with GPT-4.1. It has five ready knowledge sources and
web search enabled. It has no tools, no triggers, no connected agents, and Work IQ
is disabled. This verifies it as a published knowledge agent, not yet a local task
broker or multi-agent coordinator.

No Copilot Studio state was changed during this audit.

## Lenovo source

Lenovo document `SG10062` is the user guide for ThinkPad T14 Gen 6, P14s Gen 6
AMD, T16 Gen 4, and P16s Gen 4 AMD. It is useful as device documentation but does
not establish a supported Lenovo AI Now API. The bounded legacy adapter remains
the only supplied programmatic integration and is kept outside the critical path.

