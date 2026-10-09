import assert from "node:assert/strict";
import test from "node:test";
import { isFreshCloudInspectorCapability, validateCloudInspectionReceipt } from "../lib/cloud-inspect-receipt.ts";

const now = Date.parse("2026-10-09T01:00:00.000Z");
const taskId = "cloud-read-00000000-0000-0000-0000-000000000001";
const chainId = "cloud-chain-00000000-0000-0000-0000-000000000001";
const workerId = "cloudflare-readonly-inspector";
const provider = "cloudflare";
const leaseId = "lease-0123456789abcdef";
function receipt() {
  return {
    status: "complete", taskId, chainId, handoffCount: 0,
    receipts: [
      { schemaVersion: 1, kind: "route-selection-receipt", id: "sel-0123456789abcdef", routeLeaseId: leaseId,
        taskId, chainId, capability: "cloud.inspect",
        selected: { workerId, provider }, eligibleWorkers: [workerId] },
      { schemaVersion: 1, kind: "execution-receipt", taskId, chainId,
        capability: "cloud.inspect", workerId, provider,
        routeLeaseId: leaseId, selectionReceiptId: "sel-0123456789abcdef",
        providerReceipt: { id: `cloud-inspect-${leaseId}`, routeLeaseId: leaseId, selectionReceiptId: "sel-0123456789abcdef",
          taskId, chainId, capability: "cloud.inspect", workerId, provider, readOnly: true, verified: true,
          script: "mahoraga-owner-gateway",
          deploymentId: "12345678-1234-1234-1234-123456789abc",
          versionId: "87654321-4321-4321-4321-987654321abc",
          deployedAt: "2026-10-08T22:00:00.000Z",
          observedAt: new Date(now - 1000).toISOString(), trafficPercentage: 100 },
      },
    ],
  };
}

test("accepts freshly observed real broker lineage, returning only sanitized deployment facts", () => {
  const result = validateCloudInspectionReceipt(receipt(), taskId, chainId, now);
  assert.deepEqual(result, {
    script: "mahoraga-owner-gateway", deploymentId: "12345678-1234-1234-1234-123456789abc",
    versionId: "87654321-4321-4321-4321-987654321abc",
    observedAt: new Date(now - 1000).toISOString(), trafficPercentage: 100,
  });
  assert.equal(validateCloudInspectionReceipt({ ...receipt(), receipts: receipt().receipts }, taskId, chainId, now).trafficPercentage, 100);
});

test("rejects stale, future, foreign, duplicate and structurally valid but inconsistent receipts", () => {
  const attacks: Array<{ name: string; mutate: (value: ReturnType<typeof receipt>) => void }> = [
    { name: "wrong outer task", mutate: v => { v.taskId = "foreign-task"; } },
    { name: "wrong outer chain", mutate: v => { v.chainId = "foreign-chain"; } },
    { name: "handoff counted", mutate: v => { v.handoffCount = 1; } },
    { name: "selection missing", mutate: v => { v.receipts.splice(0, 1); } },
    { name: "duplicate receipt", mutate: v => { v.receipts.push(v.receipts[1]!); } },
    { name: "foreign selection worker", mutate: v => { v.receipts[0]!.selected!.workerId = "foreign-worker"; } },
    { name: "foreign execution worker", mutate: v => { v.receipts[1]!.workerId = "foreign-worker"; } },
    { name: "mismatched inner task", mutate: v => { v.receipts[1]!.providerReceipt!.taskId = "foreign-task"; } },
    { name: "mismatched inner chain", mutate: v => { v.receipts[1]!.providerReceipt!.chainId = "foreign-chain"; } },
    { name: "spoofed lease id", mutate: v => { v.receipts[1]!.providerReceipt!.routeLeaseId = "lease-bad"; } },
    { name: "foreign well-formed selection id", mutate: v => { v.receipts[0]!.id = "sel-fedcba9876543210"; } },
    { name: "foreign well-formed selected lease", mutate: v => { v.receipts[0]!.routeLeaseId = "lease-fedcba9876543210"; } },
    { name: "foreign well-formed execution selection id", mutate: v => { v.receipts[1]!.selectionReceiptId = "sel-fedcba9876543210"; } },
    { name: "foreign well-formed execution lease", mutate: v => { v.receipts[1]!.routeLeaseId = "lease-fedcba9876543210"; } },
    { name: "foreign well-formed provider selection id", mutate: v => { v.receipts[1]!.providerReceipt!.selectionReceiptId = "sel-fedcba9876543210"; } },
    { name: "foreign well-formed provider lease and internally consistent provider receipt id", mutate: v => {
      v.receipts[1]!.providerReceipt!.routeLeaseId = "lease-fedcba9876543210";
      v.receipts[1]!.providerReceipt!.id = "cloud-inspect-lease-fedcba9876543210";
    } },
    { name: "receipt id contradicts lease", mutate: v => { v.receipts[1]!.providerReceipt!.id = "cloud-inspect-lease-0000000000000000"; } },
    { name: "stale replay", mutate: v => { v.receipts[1]!.providerReceipt!.observedAt = new Date(now - 91_000).toISOString(); } },
    { name: "future timestamp", mutate: v => { v.receipts[1]!.providerReceipt!.observedAt = new Date(now + 6_000).toISOString(); } },
    { name: "wrong script", mutate: v => { v.receipts[1]!.providerReceipt!.script = "foreign-script"; } },
    { name: "write receipt", mutate: v => { v.receipts[1]!.providerReceipt!.readOnly = false; } },
    { name: "insufficient traffic", mutate: v => { v.receipts[1]!.providerReceipt!.trafficPercentage = 50; } },
    { name: "missing provider attestation", mutate: v => { v.receipts[1]!.providerReceipt!.verified = false; } },
  ];
  for (const {name, mutate} of attacks) {
    const value = receipt();
    mutate(value);
    assert.throws(() => validateCloudInspectionReceipt(value, taskId, chainId, now), /cloud-inspection-receipt-invalid/, name);
  }
});

test("Cloudflare inspection eligibility requires exact attested worker and fresh evidence", () => {
  const good = {
    capability: "cloud.inspect", routable: true, enabled: true, provider: "cloudflare",
    workerId: "cloudflare-readonly-inspector", workerIds: ["cloudflare-readonly-inspector"],
    lastObservedAt: new Date(now - 1000).toISOString(),
  };
  assert.equal(isFreshCloudInspectorCapability(good, now), true);
  const invalid = [
    { ...good, provider: "github" },
    { ...good, workerId: "foreign-worker" },
    { ...good, workerIds: ["foreign-worker"] },
    { ...good, routable: false },
    { ...good, enabled: false },
    { ...good, lastObservedAt: null },
    { ...good, lastObservedAt: "not-a-date" },
    { ...good, lastObservedAt: new Date(now - 30_001).toISOString() },
    { ...good, lastObservedAt: new Date(now + 5_001).toISOString() },
  ];
  for (const item of invalid) {
    assert.equal(isFreshCloudInspectorCapability(item, now), false, JSON.stringify(item));
  }
  // Render-time eligibility is not permanent: a later click must recheck freshness.
  assert.equal(isFreshCloudInspectorCapability(good, now + 30_001), false);
});
