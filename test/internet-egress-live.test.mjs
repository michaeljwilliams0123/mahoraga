import test from "node:test";
import assert from "node:assert/strict";
import { createInternetEgressController } from "../src/internet-egress.mjs";

const LIVE = process.env.GITHUB_ACTIONS === "true" && process.platform === "linux";

test("PR verification checks out, scans public Internet evidence, and checks back in", { skip: !LIVE }, async () => {
  const controller = createInternetEgressController({ maximumBytes: 262_144, timeoutMs: 20_000 });
  const lease = controller.checkOut({
    objectiveId: "pr-internet-egress-canary",
    purpose: "Verify owner-approved outbound public Internet scanning from Mahoraga PR validation",
    url: "https://raw.githubusercontent.com/michaeljwilliams0123/mahoraga/main/package.json",
  });

  assert.equal(lease.state, "checked-out");
  assert.equal(lease.targetHost, "raw.githubusercontent.com");

  const result = await controller.read(lease.leaseId);
  assert.equal(result.status, 200);
  const observed = JSON.parse(result.bytes.toString("utf8"));
  assert.equal(observed.name, "project-mahoraga-v2");
  assert.equal(typeof observed.version, "string");

  const receipt = controller.checkIn(lease.leaseId, result);
  assert.equal(receipt.state, "checked-in");
  assert.equal(receipt.targetHost, "raw.githubusercontent.com");
  assert.equal(receipt.status, 200);
  assert.match(receipt.sha256, /^[a-f0-9]{64}$/);
  assert.equal(receipt.creditCost, 0);
  assert.equal(receipt.paidFallback, false);
  assert.equal(Object.hasOwn(receipt, "bytes"), false);
});
