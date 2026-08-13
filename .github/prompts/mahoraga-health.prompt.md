---
name: mahoraga-health
description: Inspect Mahoraga runtime health and diagnose failures without changing the system.
agent: ask
tools: ['search/codebase']
---
Inspect [the canonical manifest](../../mahoraga.manifest.json), the latest runtime status, worker heartbeats, queued tasks, failed tasks, and test results.

Return:

1. Overall health: healthy, degraded, or unavailable.
2. Exact evidence supporting that state.
3. The most likely root cause for every degraded component.
4. A bounded recovery recommendation.

Do not edit files, enable workers, connect cloud services, or activate improvements.

