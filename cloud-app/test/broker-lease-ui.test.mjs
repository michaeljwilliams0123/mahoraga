import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BROKER_OBSERVATION_KIND,
  classifyAttestationMetrics,
  classifyBrokerObservationWindow,
  classifyCompletionLease,
  classifyExecutionDeadline,
  classifyZeroCreditExhaustion,
  narrowRouteLeaseScope,
  projectBrokerLeaseSurface,
} from "../lib/broker-lease-surface.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpitView = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const commandCockpit = readFileSync(join(root, "components/cockpit/CommandCockpit.tsx"), "utf8");
const cards = readFileSync(join(root, "components/cockpit/BrokerLeaseCards.tsx"), "utf8");
const surfaceSrc = readFileSync(join(root, "lib/broker-lease-surface.ts"), "utf8");

describe("7.0.0-alpha.2 universal-broker lease/deadline cockpit UI", () => {
  it("pins product identity Mahoraga and provenance-only build", () => {
    const surface = projectBrokerLeaseSurface();
    assert.equal(surface.product, "Mahoraga");
    assert.equal(surface.buildProvenanceOnly, "7.0.0-alpha.2");
    assert.match(cockpitView, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(cockpitView, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(cockpitView, /<h2>7\.0\.0-alpha\.2/);
    assert.match(surfaceSrc, /product: "Mahoraga"/);
  });

  it("requires schema, receipt identity, exact source binding, freshness, and non-contradiction", () => {
    const now = Date.parse("2026-10-02T12:00:00.000Z");
    const sourceSha = "a".repeat(40);
    const base = {
      schemaVersion: 1,
      kind: BROKER_OBSERVATION_KIND,
      receiptId: "brokerobs-test_1234",
      sourceSha,
      verified: true,
      observedAt: "2026-10-02T11:59:00.000Z",
      validUntil: "2026-10-02T12:01:00.000Z",
    };
    assert.equal(classifyBrokerObservationWindow(undefined, now, sourceSha).reason, "broker-observation-schema-invalid");
    assert.equal(classifyBrokerObservationWindow({ verified: true }, now, sourceSha).reason, "broker-observation-schema-invalid");
    assert.equal(classifyBrokerObservationWindow({ ...base, receiptId: "bad" }, now, sourceSha).reason, "broker-observation-receipt-invalid");
    assert.equal(classifyBrokerObservationWindow({ ...base, sourceSha: "bad" }, now, sourceSha).reason, "broker-observation-source-invalid");
    assert.equal(classifyBrokerObservationWindow(base, now).reason, "broker-observation-source-unbound");
    assert.equal(classifyBrokerObservationWindow(base, now, "b".repeat(40)).reason, "broker-observation-source-mismatch");
    assert.equal(classifyBrokerObservationWindow({ ...base, contradicted: true }, now, sourceSha).reason, "broker-observation-contradicted");
    assert.equal(classifyBrokerObservationWindow({ ...base, observedAt: "2026-10-02T12:00:01.000Z" }, now, sourceSha).reason, "broker-observation-future");
    assert.equal(classifyBrokerObservationWindow({ ...base, observedAt: "2026-10-02T11:58:00.000Z", validUntil: "2026-10-02T11:59:00.000Z" }, now, sourceSha).reason, "broker-observation-stale");
    assert.equal(classifyBrokerObservationWindow({ ...base, observedAt: "not-a-date" }, now, sourceSha).reason, "broker-observation-time-invalid");
    assert.equal(classifyBrokerObservationWindow(base, now, sourceSha).ok, true);
    assert.match(cards, /UNKNOWN \/ UNOBSERVED/);
    assert.match(cards, /verified flag alone is insufficient/);
    assert.match(cards, /exact receipt\/source binding required/);
    assert.match(cards, /no runtime health or failure is inferred/);
  });

  it("keeps manipulated routing metrics as deterministic classifier tests, never production observations", () => {
    assert.equal(classifyAttestationMetrics({ observedLatencyMs: -1 }).reason, "attestation-metrics-invalid");
    assert.equal(classifyAttestationMetrics({ queueDepth: -1 }).reason, "attestation-metrics-invalid");
    assert.equal(classifyAttestationMetrics({ queueDepth: 1.5 }).reason, "attestation-metrics-invalid");
    assert.equal(classifyAttestationMetrics({ reliabilityScore: 1.01 }).reason, "attestation-metrics-invalid");
    assert.equal(classifyAttestationMetrics({ reliabilityScore: -0.01 }).reason, "attestation-metrics-invalid");
    assert.equal(classifyAttestationMetrics({ observedLatencyMs: 12, queueDepth: 0, reliabilityScore: 1 }).ok, true);
    assert.doesNotMatch(cards, /observedLatencyMs:\s*-1/);
    assert.doesNotMatch(cards, /queueDepth:\s*1\.5/);
    assert.doesNotMatch(cards, /reliabilityScore:\s*1\.01/);
    assert.match(cockpitView, /<BrokerLeaseCards \/>/);
    assert.match(commandCockpit, /<BrokerLeaseCards \/>/);
    assert.match(commandCockpit, /METRICS_MANIP_REJECT/);
  });

  it("fails closed on observed expired deadlines without manufacturing one in the UI", () => {
    const now = Date.parse("2026-09-28T21:40:00.000Z");
    assert.equal(classifyExecutionDeadline("2026-09-28T21:39:59.000Z", now).reason, "execution-deadline-exceeded");
    assert.equal(classifyExecutionDeadline("not-a-date", now).reason, "execution-deadline-invalid");
    assert.equal(classifyExecutionDeadline("2026-09-28T21:41:00.000Z", now).ok, true);
    assert.doesNotMatch(cards, /2026-09-28T21:39:59\.000Z/);
    assert.match(cards, /execution-deadline-unobserved/);
    assert.match(commandCockpit, /DEADLINE_FAIL_CLOSED/);
  });

  it("displays route-lease scope only when verified scope evidence is supplied", () => {
    const scope = narrowRouteLeaseScope({
      requestedPermission: "read",
      workerAuthorityScopes: ["repo:mahoraga:read", "cloud:execute"],
      requestAuthorityScopes: ["repo:mahoraga:read", "cloud:read"],
    });
    assert.equal(scope.permissionClass, "read");
    assert.deepEqual(scope.authorityScopes, ["repo:mahoraga:read"]);
    assert.match(cards, /Route-lease scope/);
    assert.match(cards, /route-lease-scope-unobserved/);
    assert.match(commandCockpit, /LEASE_SCOPE_NARROW/);
  });

  it("keeps lease-expiry adversarial cases in tests and defaults UI to unobserved", () => {
    const expired = classifyCompletionLease({
      expiresAt: "2026-09-28T21:40:00.000Z",
      completedAtMs: Date.parse("2026-09-28T21:41:01.000Z"),
    });
    assert.equal(expired.ok, false);
    assert.equal(expired.reason, "execution-lease-expired");
    assert.equal(expired.httpStatus, 409);
    const live = classifyCompletionLease({
      expiresAt: "2026-09-28T21:42:00.000Z",
      completedAtMs: Date.parse("2026-09-28T21:41:01.000Z"),
    });
    assert.equal(live.ok, true);
    assert.equal(live.httpStatus, 200);
    const surface = projectBrokerLeaseSurface();
    assert.equal(surface.leaseExpiryHttpStatus, 409);
    assert.equal(surface.leaseExpiryNotHttp200, true);
    assert.doesNotMatch(cards, /completedAtMs:\s*Date\.parse/);
    assert.match(cards, /completion-lease-unobserved/);
    assert.match(commandCockpit, /LEASE_EXPIRY_NOT_200/);
  });

  it("keeps zero-credit exhaustion closed with no metered fallthrough and no fabricated UI exhaustion", () => {
    const closed = classifyZeroCreditExhaustion({ requireZeroCredit: true, eligibleZeroCredit: false });
    assert.equal(closed.ok, false);
    assert.equal(closed.reason, "no-eligible-route");
    assert.equal(closed.meteredFallthrough, false);
    const open = classifyZeroCreditExhaustion({ requireZeroCredit: true, eligibleZeroCredit: true });
    assert.equal(open.ok, true);
    assert.equal(open.meteredFallthrough, false);
    const surface = projectBrokerLeaseSurface();
    assert.equal(surface.meteredFallthrough, false);
    assert.equal(surface.failClosed, true);
    assert.equal(surface.grantsTrafficAuthority, false);
    assert.equal(surface.createsProviderRoute, false);
    assert.equal(surface.merge874IsTrafficAuthority, false);
    assert.doesNotMatch(cards, /eligibleZeroCredit:\s*false/);
    assert.match(cards, /zero-credit-state-unobserved/);
    assert.match(commandCockpit, /ZERO_CREDIT_NO_FALLTHROUGH/);
    assert.match(commandCockpit, /BROKER_LEASE_OBS/);
    assert.match(cockpitView, /Universal broker lease \/ deadline/);
    assert.match(cockpitView, /do not grant traffic authority/);
  });
});
