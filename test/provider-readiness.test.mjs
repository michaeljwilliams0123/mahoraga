import test from "node:test";
import assert from "node:assert/strict";
import { collectProviderReadiness } from "../src/provider-readiness.mjs";

test("provider readiness report exposes only bounded readiness metadata", async () => {
  const report = await collectProviderReadiness({
    desktop: async () => ({ verified: true, receiptMetadata: { platformSupported: true, interactive: true, applications: [{ process: "EXCEL", windowCount: 1 }], windowTitle: "Private.xlsx" } }),
    microsoftQueue: async () => ({ verified: true, receiptMetadata: { prefixReady: true, dataverseUrlConfigured: true, tenantConfigured: true, queueScriptReady: true, authScriptReady: true, silentAuthAvailable: true, authDiagnosis: "silent-tier-available", token: "secret" } }),
    localReasoner: async () => ({ verified: true, providerHealth: { availability: "healthy", modelCount: 2, modelIds: ["private-model"] } }),
    githubCopilot: async () => ({ verified: true, providerHealth: { availability: "configured", authentication: "unverified", quota: "unverified", version: "1.2.3", stdout: "private" } }),
    primaryCodexBuilder: async () => ({ verified: false, providerHealth: { availability: "unavailable", invocation: "desktop-appx-access-denied", authentication: "not-probed", stderr: "private" } }),
    workspaceAgent: async () => ({ verified: false, providerHealth: { accessTokenConfigured: false, triggerIdConfigured: false, platformApiKeyRejected: false, resultTransport: "github-secondary-branch", accessToken: "secret" } }),
  }, { now: () => new Date("2026-08-24T00:00:00.000Z") });

  assert.equal(report.counts.total, 6);
  assert.equal(report.counts.verified, 4);
  assert.equal(report.activationPerformed, false);
  assert.equal(report.providers.desktop.allowlistedApplicationTypesVisible, 1);
  assert.equal(report.providers.microsoftQueue.silentAuthAvailable, true);
  assert.equal(report.providers.localReasoner.modelCount, 2);
  assert.equal(report.providers.githubCopilot.versionDetected, true);
  assert.equal(report.providers.primaryCodexBuilder.invocation, "desktop-appx-access-denied");
  assert.equal(report.providers.workspaceAgent.resultTransport, "github-secondary-branch");

  const serialized = JSON.stringify(report);
  for (const forbidden of ["Private.xlsx", "private-model", "secret", "stdout", "stderr", "token"]) {
    assert.equal(serialized.includes(forbidden), false, `forbidden readiness detail leaked: ${forbidden}`);
  }
});

test("provider readiness converts failed probes into safe unavailable states", async () => {
  const fail = async () => { throw new Error("credential=secret"); };
  const report = await collectProviderReadiness({
    desktop: fail,
    microsoftQueue: fail,
    localReasoner: fail,
    githubCopilot: fail,
    primaryCodexBuilder: fail,
    workspaceAgent: fail,
  });

  assert.equal(report.counts.verified, 0);
  assert.equal(report.providers.desktop.verified, false);
  assert.equal(report.providers.microsoftQueue.authDiagnosis, "indeterminate");
  assert.equal(report.providers.localReasoner.availability, "unavailable");
  assert.equal(report.providers.githubCopilot.availability, "unavailable");
  assert.equal(report.providers.primaryCodexBuilder.availability, "unavailable");
  assert.equal(report.providers.workspaceAgent.verified, false);
  assert.equal(JSON.stringify(report).includes("credential=secret"), false);
});
