import test from "node:test";
import assert from "node:assert/strict";
import { runCommunicationSimulation } from "../src/communication-simulator.mjs";

test("communication simulator exercises encrypted owner-paired chat round trip", async () => {
  const report = await runCommunicationSimulation({
    ownerIdentity: "owner@example.com",
    allowedOrigin: "https://mahoraga.example",
    now: () => 0,
  });

  assert.equal(report.ok, true);
  assert.equal(report.protocol, "owner-paired-relay");
  assert.equal(report.externalProviderCalls, 0);
  assert.equal(report.receipt.status, "accepted");
  assert.equal(report.receipt.capability, "assistant.respond");
  assert.equal(report.assertions.ownerBound, true);
  assert.equal(report.assertions.originBound, true);
  assert.equal(report.assertions.encryptedRoundTrip, true);
  assert.equal(report.assertions.replayRejected, true);
  assert.equal(report.assertions.noPlaintextInFrames, true);
});

test("communication simulator accepts production-shaped allowed origin arrays", async () => {
  const report = await runCommunicationSimulation({
    ownerIdentity: "owner@example.com",
    allowedOrigin: ["https://mahoraga.example", "https://alternate.example"],
    now: () => 0,
  });

  assert.equal(report.ok, true);
  assert.equal(report.assertions.originBound, true);
  assert.equal(report.assertions.encryptedRoundTrip, true);
});
