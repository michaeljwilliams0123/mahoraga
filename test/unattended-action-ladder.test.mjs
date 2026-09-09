import test from "node:test";
import assert from "node:assert/strict";

import { createOmnichannelEnvelope } from "../src/omnichannel-intake.mjs";
import { planUnattendedAction } from "../src/unattended-action-ladder.mjs";
import { summarizeConnectorReadiness } from "../src/provider-readiness.mjs";

const readiness = {
  generatedAt: "2026-09-09T00:00:00.000Z",
  providers: {
    microsoft365: { verified: true },
    microsoftQueue: { verified: true, silentAuthAvailable: true },
  },
};

test("unattended action ladder dispatches bounded GitHub and file work at zero credit", () => {
  const connectors = summarizeConnectorReadiness({
    generatedAt: readiness.generatedAt,
    providers: {
      desktop: { verified: true },
      microsoft365: { verified: true },
      microsoftQueue: { verified: true, silentAuthAvailable: true },
      localReasoner: { verified: true },
      githubCopilot: { verified: false },
      primaryCodexBuilder: { verified: false },
      workspaceAgent: { verified: false },
    },
  });
  const github = createOmnichannelEnvelope({
    source: "github-event",
    actor: { actorType: "owner", actorId: "michaeljwilliams0123", trustClass: "owner-explicit", accountBoundary: "local-only" },
    object: { repository: "michaeljwilliams0123/mahoraga", eventName: "pull_request", action: "opened", objectType: "pull-request", objectId: "184", deliveryId: "evt-184" },
    allowedActionClass: "observe",
    correlationId: "corr-pr",
    idempotencyKey: "gh:evt-184",
    contentReferences: [],
    routeHint: { capability: "repository.inspect", actionPackId: "github-status-report" },
    metadata: { branch: "feature/x" },
    zeroCreditEligible: true,
  }, { now: readiness.generatedAt });
  const file = createOmnichannelEnvelope({
    source: "file-drop",
    actor: { actorType: "file-watcher", actorId: "watcher-local", trustClass: "queued-ingress", accountBoundary: "local-only" },
    object: { locationClass: "local-folder", fileName: "agenda.pdf", sha256: "b".repeat(64) },
    allowedActionClass: "triage",
    correlationId: "corr-file",
    idempotencyKey: "file:agenda",
    contentReferences: ["vault:12345678-1234-4234-8234-123456789abc"],
    routeHint: { capability: "artifact.inspect", actionPackId: "file-intake" },
    metadata: { folder: "inbox" },
    zeroCreditEligible: true,
  }, { now: readiness.generatedAt });

  const githubPlan = planUnattendedAction({ envelope: github, connectorRecords: connectors, zeroCreditReadyCapabilities: ["repository.inspect", "artifact.inspect"], localReasonerReady: false });
  const filePlan = planUnattendedAction({ envelope: file, connectorRecords: connectors, zeroCreditReadyCapabilities: ["repository.inspect", "artifact.inspect"], localReasonerReady: false });
  assert.equal(githubPlan.status, "dispatch");
  assert.equal(githubPlan.tier, 1);
  assert.equal(filePlan.status, "dispatch");
  assert.equal(filePlan.preferredCapability, "artifact.inspect");
});

test("unattended action ladder holds zero-credit message work until a responder is ready", () => {
  const email = createOmnichannelEnvelope({
    source: "microsoft-message",
    actor: { actorType: "microsoft-account", actorId: "owner@outlook", trustClass: "observed-session", accountBoundary: "personal" },
    object: { service: "outlook", objectType: "email", objectId: "msg-1", threadId: "thread-1", accountBoundary: "personal" },
    allowedActionClass: "draft",
    correlationId: "corr-email",
    idempotencyKey: "email:1",
    contentReferences: [],
    routeHint: { capability: "assistant.respond", actionPackId: "email-triage" },
    metadata: { "subject-digest": "follow-up" },
    zeroCreditEligible: true,
  }, { now: readiness.generatedAt });
  const plan = planUnattendedAction({
    envelope: email,
    connectorRecords: summarizeConnectorReadiness({
      generatedAt: readiness.generatedAt,
      providers: {
        desktop: { verified: false },
        microsoft365: { verified: true },
        microsoftQueue: { verified: true, silentAuthAvailable: true },
        localReasoner: { verified: false },
        githubCopilot: { verified: false },
        primaryCodexBuilder: { verified: false },
        workspaceAgent: { verified: false },
      },
    }),
    zeroCreditReadyCapabilities: ["artifact.inspect"],
    localReasonerReady: false,
  });
  assert.equal(plan.status, "hold");
  assert.equal(plan.reasonCode, "wait-for-local-reasoner");
});
