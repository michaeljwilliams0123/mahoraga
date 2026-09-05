import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const POLICY_FILES = [
  "AGENTS.md",
  ".github/ai-instructions.md",
  ".github/copilot-instructions.md",
  ".github/agents/mahoraga-coordinator.agent.md",
  ".github/agents/mahoraga-assurance.agent.md",
];

const REQUIRED = [
  "Codex is not a code-review path",
  "Codex quota or usage-limit messages are non-blocking infrastructure signals",
  "Do not request, retry, or purchase Codex code review",
];

test("agent instructions consistently prohibit Codex review traffic", async () => {
  for (const path of POLICY_FILES) {
    const text = await readFile(new URL(`../${path}`, import.meta.url), "utf8");
    for (const phrase of REQUIRED) {
      assert.match(text, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${path} missing: ${phrase}`);
    }
  }
});

test("AI instructions identify the live ruleset and distinguish provider status from repository verification", async () => {
  const text = await readFile(new URL("../.github/ai-instructions.md", import.meta.url), "utf8");
  assert.match(text, /ruleset `22327855` is active/);
  assert.match(text, /Required repository checks are Verify \(ubuntu-latest\) and Verify \(windows-latest\)/);
  assert.match(text, /Vercel provider or deployment status is not a PR completion gate/);
  assert.match(text, /Verify unified Vercel workspace` may run as an observational job and must not gate merge/);
  assert.doesNotMatch(text, /ruleset `22284961` is active/);
  assert.doesNotMatch(text, /repository-local workspace verification remains required while the live ruleset requires that check/);
});
