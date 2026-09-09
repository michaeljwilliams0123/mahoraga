import test from "node:test";
import assert from "node:assert/strict";

import { emptyAutonomyMemoryBank, reconcileAutonomyMemoryBank, summarizeAutonomyMemoryBank, validateAutonomyMemoryBank } from "../src/autonomy-memory-bank.mjs";

test("autonomy memory bank reconciles operational, institutional, objective, and connector memory", () => {
  const memory = reconcileAutonomyMemoryBank({
    memory: emptyAutonomyMemoryBank(),
    operationalIncoming: [{
      schemaVersion: 1,
      eventId: "evt-route-1",
      eventClass: "route-outcome",
      source: "omnichannel",
      connectorId: "microsoft",
      objectiveId: "email-follow-up",
      correlationId: "corr-1",
      status: "held",
      reasonCode: "wait-for-local-reasoner",
      observedAt: "2026-09-09T00:00:00.000Z",
      zeroCredit: true,
      providerRequired: false,
    }],
    institutionalIncoming: [{
      memoryClass: "procedure",
      subject: "email-triage",
      statement: "Email triage drafts should hold when no zero-credit responder is ready.",
      provenance: "verified-outcome",
      confidence: 0.9,
      freshness: "current",
      objectiveIds: ["email-follow-up"],
      evidenceRefs: ["evt-route-1"],
      capability: "assistant-respond",
      supersedes: [],
    }],
    objectiveIncoming: [{
      schemaVersion: 1,
      objectiveId: "email-follow-up",
      title: "Follow up on important inbound email",
      origin: "owner-command",
      missionAlignment: 90,
      impact: 80,
      urgency: 85,
      confidence: 75,
      dependencyReadiness: 60,
      reversibility: 70,
      costEfficiency: 100,
      capabilityReadiness: 65,
      evidenceQuality: 70,
      state: "candidate",
      fingerprint: "a".repeat(64),
      createdAt: "2026-09-09T00:00:00.000Z",
      updatedAt: "2026-09-09T00:00:00.000Z",
    }],
    objectiveTemplateIncoming: [{
      schemaVersion: 1,
      templateId: "daily-email-triage",
      title: "Daily email triage",
      triggerClass: "schedule",
      actionPackId: "email-triage",
      preferredConnectorFamily: "microsoft",
      recurrence: "daily",
      confidence: 0.8,
      requiresApproval: false,
      lastUsedAt: null,
      updatedAt: "2026-09-09T00:00:00.000Z",
      zeroCredit: true,
      providerRequired: false,
    }],
    connectorIncoming: [{
      schemaVersion: 1,
      connectorId: "microsoft",
      family: "microsoft",
      trustState: "ready",
      capabilities: ["artifact.inspect", "assistant.respond"],
      lastHealthyAt: "2026-09-09T00:00:00.000Z",
      lastFailureCode: null,
      zeroCreditReady: true,
      updatedAt: "2026-09-09T00:00:00.000Z",
      zeroCredit: true,
      providerRequired: false,
    }],
    now: "2026-09-09T00:00:00.000Z",
  });

  const summary = summarizeAutonomyMemoryBank(memory);
  assert.equal(summary.operationalEventCount, 1);
  assert.equal(summary.institutionalMemoryCount, 1);
  assert.equal(summary.objectiveCount, 1);
  assert.equal(summary.objectiveTemplateCount, 1);
  assert.equal(summary.activeConnectorCount, 1);
  assert.deepEqual(validateAutonomyMemoryBank(memory), memory);
});

test("autonomy memory bank keeps the newest connector observation per connector", () => {
  const memory = reconcileAutonomyMemoryBank({
    connectorIncoming: [
      {
        schemaVersion: 1,
        connectorId: "microsoft",
        family: "microsoft",
        trustState: "blocked",
        capabilities: ["assistant.respond"],
        lastHealthyAt: null,
        lastFailureCode: "blocked",
        zeroCreditReady: false,
        updatedAt: "2026-09-08T00:00:00.000Z",
        zeroCredit: true,
        providerRequired: false,
      },
      {
        schemaVersion: 1,
        connectorId: "microsoft",
        family: "microsoft",
        trustState: "ready",
        capabilities: ["assistant.respond"],
        lastHealthyAt: "2026-09-09T00:00:00.000Z",
        lastFailureCode: null,
        zeroCreditReady: true,
        updatedAt: "2026-09-09T00:00:00.000Z",
        zeroCredit: true,
        providerRequired: false,
      },
    ],
    now: "2026-09-09T00:00:00.000Z",
  });
  assert.equal(memory.connectorRecords[0].trustState, "ready");
  assert.equal(memory.connectorRecords[0].zeroCreditReady, true);
});
