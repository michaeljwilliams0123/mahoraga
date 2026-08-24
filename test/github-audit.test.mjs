import test from "node:test";
import assert from "node:assert/strict";
import { buildGithubAudit, isDeterministicDependency, renderGithubAuditMarkdown } from "../src/github-audit.mjs";

test("repository GitHub audit enforces all blocking controls", async () => {
  const report = await buildGithubAudit();
  assert.equal(report.healthy, true, JSON.stringify(report.checks.filter((check) => !check.healthy)));
  assert.equal(report.counts.blockingFailures, 0);
  assert.equal(report.counts.advisories, 0, JSON.stringify(report.checks.filter((check) => !check.healthy)));
  assert.equal(report.checks.find((check) => check.id === "public-repository-privacy")?.healthy, true);
  assert.equal(report.checks.find((check) => check.id === "deterministic-dependencies")?.healthy, true);
  assert.equal(report.checks.find((check) => check.id === "github-action-sha-pinning")?.healthy, true);
});

test("GitHub audit renders a bounded zero-credit Actions dashboard", async () => {
  const markdown = renderGithubAuditMarkdown(await buildGithubAudit());
  assert.match(markdown, /^## Mahoraga GitHub assurance/m);
  assert.match(markdown, /\*\*Ready\*\* · 10 controls · 0 blocking failures · 0 advisories/);
  assert.match(markdown, /\| github-action-sha-pinning \| Pass \| advisory \|/);
  assert.match(markdown, /does not invoke Codex, consume model credits, expose localhost/);
  assert.doesNotMatch(markdown, /[A-Z]:\\Users\\|gh[pousr]_|github_pat_/i);
});

test("dependency audit rejects floating and range specifications", () => {
  assert.equal(isDeterministicDependency("1.0.63"), true);
  assert.equal(isDeterministicDependency("2.0.0-rc.1"), true);
  assert.equal(isDeterministicDependency("latest"), false);
  assert.equal(isDeterministicDependency("^1.0.63"), false);
  assert.equal(isDeterministicDependency("https://example.com/package.tgz"), false);
});
