---
name: mahoraga-repository-review
description: Review the Mahoraga repository against its canonical manifest and detect drift.
agent: ask
tools: ['search/codebase']
---
Compare the implementation, README, worker registry, task router, tests, and UI with [the canonical manifest](../../mahoraga.manifest.json).

Report configuration drift, undocumented capabilities, enabled workers with no runtime implementation, and runtime behavior not declared in the manifest. Separate verified facts from recommendations. Do not modify the repository.

