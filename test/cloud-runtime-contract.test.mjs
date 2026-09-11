import test from "node:test";
import assert from "node:assert/strict";
import { cloudRuntimeContract } from "../src/server.mjs";

test("cloud runtime contract makes the candidate session path and Windows fallback explicit", () => {
  const contract = cloudRuntimeContract({
    version: "7.0.0-alpha.2",
    protocols: { apiProtocol: "2", relayProtocol: "1", capabilityRegistrySchema: "1", taskSchema: "3", workerContract: "2" },
  });

  assert.deepEqual(contract, {
    schemaVersion: 1,
    session: { protocolVersion: 1, actionProtocolVersion: 1, transport: "same-origin-owner-session" },
    candidate: { runtimeVersion: "7.0.0-alpha.2", cloudControlPlane: "protocol-2" },
    fallback: { kind: "encrypted-relay", windowsRollbackVersion: "3.6.0", windowsRollbackPairing: "unsupported" },
  });
});
