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
  assert.match(text, /ruleset `22502690` \(`Protect main - exact-head Verify`\) is active/);
  assert.match(text, /Verify \(ubuntu-latest\) and Verify \(windows-latest\) pass on its exact current head/);
  assert.match(text, /Vercel is retired and non-routable/);
  assert.doesNotMatch(text, /current private-repository plan does not enforce a GitHub ruleset/);
  assert.doesNotMatch(text, /Verify unified Vercel workspace` may run as an observational job/);
});
