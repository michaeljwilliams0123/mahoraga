import test from "node:test";
import assert from "node:assert/strict";
import { createInternetEgressController } from "../src/internet-egress.mjs";

const NOW = new Date("2026-09-07T05:30:00.000Z");

function publicResolver() {
  return Promise.resolve([{ address: "140.82.113.6", family: 4 }]);
}

test("internet egress requires an explicit checkout purpose and returns a content-free check-in receipt", async () => {
  let fetched;
  const controller = createInternetEgressController({
    now: () => NOW,
    resolveHost: publicResolver,
    fetchImpl: async (url, options) => {
      fetched = { url: String(url), options };
      return new Response("public repository evidence", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    },
  });

  const lease = controller.checkOut({
    objectiveId: "obj-research-github",
    purpose: "Inspect public Mahoraga repository metadata for the autonomous learning scan",
    url: "https://api.github.com/repos/michaeljwilliams0123/mahoraga",
  });
  assert.equal(lease.state, "checked-out");
  assert.equal(lease.method, "GET");
  assert.equal(lease.targetHost, "api.github.com");
  assert.equal(lease.authority, "owner-approved-public-internet-read");

  const result = await controller.read(lease.leaseId);
  assert.equal(result.status, 200);
  assert.equal(result.sizeBytes, Buffer.byteLength("public repository evidence"));
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(fetched.options.method, "GET");
  assert.equal(fetched.options.redirect, "manual");
  assert.equal(Object.keys(fetched.options.headers).some((key) => /authorization|cookie|token/i.test(key)), false);

  const receipt = controller.checkIn(lease.leaseId, result);
  assert.equal(receipt.state, "checked-in");
  assert.equal(receipt.objectiveId, "obj-research-github");
  assert.equal(receipt.targetHost, "api.github.com");
  assert.equal(receipt.status, 200);
  assert.equal(receipt.sha256, result.sha256);
  assert.equal(receipt.creditCost, 0);
  assert.equal(receipt.paidFallback, false);
  assert.equal(JSON.stringify(receipt).includes("public repository evidence"), false);
});

test("internet egress fails closed without a checkout and rejects unsafe targets", async () => {
  const controller = createInternetEgressController({ now: () => NOW, resolveHost: publicResolver, fetchImpl: async () => new Response("ok") });
  await assert.rejects(() => controller.read("egress-missing"), /egress-lease-not-found/);
  assert.throws(() => controller.checkOut({ objectiveId: "obj-1", purpose: "", url: "https://example.com" }), /egress-purpose-required/);
  assert.throws(() => controller.checkOut({ objectiveId: "obj-1", purpose: "scan", url: "http://example.com" }), /egress-https-required/);
  assert.throws(() => controller.checkOut({ objectiveId: "obj-1", purpose: "scan", url: "https://user:pass@example.com" }), /egress-userinfo-forbidden/);
  assert.throws(() => controller.checkOut({ objectiveId: "obj-1", purpose: "scan", url: "https://127.0.0.1/internal" }), /egress-private-target/);
});

test("internet egress blocks private DNS resolution, redirects, oversize responses, reuse, and expired leases", async () => {
  let clock = new Date(NOW);
  const privateController = createInternetEgressController({
    now: () => clock,
    resolveHost: async () => [{ address: "10.0.0.8", family: 4 }],
    fetchImpl: async () => new Response("ok"),
  });
  const privateLease = privateController.checkOut({ objectiveId: "obj-1", purpose: "scan", url: "https://example.com/data" });
  await assert.rejects(() => privateController.read(privateLease.leaseId), /egress-private-target/);

  const redirectController = createInternetEgressController({
    now: () => clock,
    resolveHost: publicResolver,
    fetchImpl: async () => new Response(null, { status: 302, headers: { location: "https://other.example/path" } }),
  });
  const redirectLease = redirectController.checkOut({ objectiveId: "obj-2", purpose: "scan", url: "https://example.com/data" });
  await assert.rejects(() => redirectController.read(redirectLease.leaseId), /egress-redirect-not-approved/);

  const oversizeController = createInternetEgressController({
    now: () => clock,
    resolveHost: publicResolver,
    maximumBytes: 4,
    fetchImpl: async () => new Response("12345", { status: 200 }),
  });
  const oversizeLease = oversizeController.checkOut({ objectiveId: "obj-3", purpose: "scan", url: "https://example.com/data" });
  await assert.rejects(() => oversizeController.read(oversizeLease.leaseId), /egress-response-too-large/);

  const oneShotController = createInternetEgressController({
    now: () => clock,
    resolveHost: publicResolver,
    leaseTtlMs: 1_000,
    fetchImpl: async () => new Response("ok", { status: 200 }),
  });
  const lease = oneShotController.checkOut({ objectiveId: "obj-4", purpose: "scan", url: "https://example.com/data" });
  const result = await oneShotController.read(lease.leaseId);
  oneShotController.checkIn(lease.leaseId, result);
  await assert.rejects(() => oneShotController.read(lease.leaseId), /egress-lease-closed/);

  const expired = oneShotController.checkOut({ objectiveId: "obj-5", purpose: "scan", url: "https://example.com/data" });
  clock = new Date(clock.getTime() + 2_000);
  await assert.rejects(() => oneShotController.read(expired.leaseId), /egress-lease-expired/);
});
