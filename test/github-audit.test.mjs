import test from "node:test";
import assert from "node:assert/strict";
import { buildGithubAudit, findSensitiveDeploymentMetadata, isDeterministicDependency, renderGithubAuditMarkdown } from "../src/github-audit.mjs";

test("repository GitHub audit enforces all blocking controls", async () => {
  const report = await buildGithubAudit();
  assert.equal(report.healthy, true, JSON.stringify(report.checks.filter((check) => !check.healthy)));
  assert.equal(report.counts.blockingFailures, 0);
  assert.equal(report.counts.advisories, 0, JSON.stringify(report.checks.filter((check) => !check.healthy)));
  assert.equal(report.checks.find((check) => check.id === "public-repository-privacy")?.healthy, true);
  assert.equal(report.checks.find((check) => check.id === "public-deployment-metadata")?.healthy, true);
  assert.equal(report.checks.find((check) => check.id === "deterministic-dependencies")?.healthy, true);
  assert.equal(report.checks.find((check) => check.id === "github-action-sha-pinning")?.healthy, true);
});

test("GitHub audit renders a bounded zero-credit Actions dashboard", async () => {
  const markdown = renderGithubAuditMarkdown(await buildGithubAudit());
  assert.match(markdown, /^## Mahoraga GitHub assurance/m);
  assert.match(markdown, /\*\*Ready\*\* · 11 controls · 0 blocking failures · 0 advisories/);
  assert.match(markdown, /\| github-action-sha-pinning \| Pass \| advisory \|/);
  assert.match(markdown, /does not invoke Codex, consume model credits, expose localhost/);
  assert.doesNotMatch(markdown, /[A-Z]:\\Users\\|gh[pousr]_|github_pat_/i);
});

test("deployment metadata audit detects concrete identifiers without returning their values", () => {
  const keys = {
    name: ["environment", "Name"].join(""),
    id: ["environment", "Id"].join(""),
    url: ["tenant", "Url"].join(""),
  };
  const concrete = JSON.stringify({
    [keys.name]: ["Northwind", "Production"].join(" "),
    [keys.id]: ["Default", "6f9619ff-8b86-d011-b42d-00c04fc964ff"].join("-"),
    [keys.url]: ["https://northwind", ".crm.dynamics", ".com"].join(""),
  });
  const finding = findSensitiveDeploymentMetadata(concrete);

  assert.equal(finding.sensitive, true);
  assert.deepEqual(finding.categories, ["dataverse-url", "environment-id", "environment-name", "tenant-url"]);
  assert.doesNotMatch(JSON.stringify(finding), /Northwind|6f9619ff|crm\.dynamics/i);
});

test("deployment metadata audit allows explicit placeholders, references, and fixture hosts", () => {
  const placeholders = JSON.stringify({
    environmentName: "<ENVIRONMENT_NAME>",
    environmentId: "${DATAVERSE_ENVIRONMENT_ID}",
    environmentUrl: "https://example.crm.dynamics.com",
    tenantUrl: "http://127.0.0.1:4782/",
  });

  assert.deepEqual(findSensitiveDeploymentMetadata(placeholders), { sensitive: false, categories: [] });
});

test("deployment metadata audit accepts bounded provider-specific patterns", () => {
  const finding = findSensitiveDeploymentMetadata("deployment-region = restricted-east", {
    additionalPatterns: [{ category: "deployment-region", pattern: /deployment-region\s*=\s*restricted-/i }],
  });

  assert.deepEqual(finding, { sensitive: true, categories: ["deployment-region"] });
});

test("dependency audit rejects floating and range specifications", () => {
  assert.equal(isDeterministicDependency("1.0.63"), true);
  assert.equal(isDeterministicDependency("2.0.0-rc.1"), true);
  assert.equal(isDeterministicDependency("latest"), false);
  assert.equal(isDeterministicDependency("^1.0.63"), false);
  assert.equal(isDeterministicDependency("https://example.com/package.tgz"), false);
});
