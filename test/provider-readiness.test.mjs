import test from "node:test";
import assert from "node:assert/strict";
import { collectProviderReadiness, summarizeConnectorReadiness } from "../src/provider-readiness.mjs";

test("provider readiness report exposes only bounded readiness metadata", async () => {
  const report = await collectProviderReadiness({
    desktop: async () => ({ verified: true, receiptMetadata: { platformSupported: true, interactive: true, applications: [{ process: "EXCEL", windowCount: 1 }], windowTitle: "Private.xlsx" } }),
    microsoft365: async () => ({ verified: true, providerHealth: { interactive: true, visibleApplicationTypes: 2, oneDriveRootCount: 1, dataverseProfileAuthenticated: true, directGraphAuthentication: false, applications: [{ process: "olk" }], token: "secret" } }),
    signedChrome: async () => ({ verified: true, providerHealth: { platformSupported: true, attendedSession: true, visibleChrome: true, visibleWindowCount: 2, chromeInstalled: true, profilePath: "secret-profile" } }),
    googleWorkspace: async () => ({ verified: true, providerHealth: { platformSupported: true, attendedSession: true, visibleChrome: true, visibleWindowCount: 2, chromeInstalled: true, approvedHostCount: 9, directGoogleApiAuthentication: false, contentAccessVerified: false, url: "https://drive.google.com/private" } }),
    microsoftQueue: async () => ({ verified: true, receiptMetadata: { prefixReady: true, dataverseUrlConfigured: true, tenantConfigured: true, queueScriptReady: true, authScriptReady: true, silentAuthAvailable: true, authDiagnosis: "silent-tier-available", token: "secret" } }),
    localReasoner: async () => ({ verified: true, providerHealth: { availability: "healthy", modelCount: 2, modelIds: ["private-model"] } }),
    githubCopilot: async () => ({ verified: true, providerHealth: { availability: "configured", authentication: "unverified", quota: "unverified", version: "1.2.3", stdout: "private" } }),
    primaryCodexBuilder: async () => ({ verified: true, providerHealth: { availability: "healthy", invocation: "non-interactive-cli", authentication: "verified", stderr: "private" } }),
    workspaceAgent: async () => ({ verified: false, providerHealth: { accessTokenConfigured: false, triggerIdConfigured: false, platformApiKeyRejected: false, resultTransport: "github-secondary-branch", accessToken: "secret" } }),
  }, { now: () => new Date("2026-08-24T00:00:00.000Z") });

  assert.equal(report.counts.total, 9);
  assert.equal(report.counts.verified, 8);
  assert.equal(report.activationPerformed, false);
  assert.equal(report.providers.desktop.allowlistedApplicationTypesVisible, 1);
  assert.equal(report.providers.microsoft365.dataverseProfileAuthenticated, true);
  assert.equal(report.providers.signedChrome.visibleWindowCount, 2);
  assert.equal(report.providers.googleWorkspace.approvedHostCount, 9);
  assert.equal(report.providers.microsoftQueue.silentAuthAvailable, true);
  assert.equal(report.providers.localReasoner.modelCount, 2);
  assert.equal(report.providers.githubCopilot.versionDetected, true);
  assert.equal(report.providers.primaryCodexBuilder.invocation, "non-interactive-cli");
  assert.equal(report.providers.workspaceAgent.resultTransport, "github-secondary-branch");
  const google = summarizeConnectorReadiness(report).find((item) => item.connectorId === "google");
  assert.equal(google.trustState, "ready");
  assert.equal(google.zeroCreditReady, true);

  const serialized = JSON.stringify(report);
  for (const forbidden of ["Private.xlsx", "private-model", "secret", "stdout", "stderr", "token", "secret-profile", "drive.google.com/private"]) {
    assert.equal(serialized.includes(forbidden), false, `forbidden readiness detail leaked: ${forbidden}`);
  }
});

test("provider readiness converts failed probes into safe unavailable states", async () => {
  const fail = async () => { throw new Error("credential=secret"); };
  const report = await collectProviderReadiness({
    desktop: fail,
    microsoft365: fail,
    signedChrome: fail,
    googleWorkspace: fail,
    microsoftQueue: fail,
    localReasoner: fail,
    githubCopilot: fail,
    primaryCodexBuilder: fail,
    workspaceAgent: fail,
  });

  assert.equal(report.counts.verified, 0);
  assert.equal(report.providers.desktop.verified, false);
  assert.equal(report.providers.signedChrome.verified, false);
  assert.equal(report.providers.googleWorkspace.verified, false);
  assert.equal(report.providers.microsoftQueue.authDiagnosis, "indeterminate");
  assert.equal(report.providers.localReasoner.availability, "unavailable");
  assert.equal(report.providers.githubCopilot.availability, "unavailable");
  assert.equal(report.providers.primaryCodexBuilder.availability, "unavailable");
  assert.equal(report.providers.workspaceAgent.verified, false);
  assert.equal(JSON.stringify(report).includes("credential=secret"), false);
});
