import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyAttestationMetrics,
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

  it("surfaces manipulated routing metrics as fail-closed observational cards", () => {
    assert.equal(classifyAttestationMetrics({ observedLatencyMs: -1 }).reason, "attestation-metrics-invalid");
    assert.equal(classifyAttestationMetrics({ queueDepth: -1 }).reason, "attestation-metrics-invalid");
    assert.equal(classifyAttestationMetrics({ queueDepth: 1.5 }).reason, "attestation-metrics-invalid");
    assert.equal(classifyAttestationMetrics({ reliabilityScore: 1.01 }).reason, "attestation-metrics-invalid");
    assert.equal(classifyAttestationMetrics({ reliabilityScore: -0.01 }).reason, "attestation-metrics-invalid");
    assert.equal(classifyAttestationMetrics({ observedLatencyMs: 12, queueDepth: 0, reliabilityScore: 1 }).ok, true);
    assert.match(cards, /Manipulated routing metrics/);
    assert.match(cards, /attestation-metrics-invalid|negative latency\/queue/);
    assert.match(cockpitView, /<BrokerLeaseCards \/>/);
    assert.match(commandCockpit, /<BrokerLeaseCards \/>/);
    assert.match(commandCockpit, /METRICS_MANIP_REJECT/);
  });

  it("fails closed when the request is already past deadline", () => {
    const now = Date.parse("2026-09-28T21:40:00.000Z");
    assert.equal(classifyExecutionDeadline("2026-09-28T21:39:59.000Z", now).reason, "execution-deadline-exceeded");
    assert.equal(classifyExecutionDeadline("not-a-date", now).reason, "execution-deadline-invalid");
    assert.equal(classifyExecutionDeadline("2026-09-28T21:41:00.000Z", now).ok, true);
    assert.match(cards, /Execution deadline/);
    assert.match(cards, /already-past deadlineAt cannot select, lease, or hand off/);
    assert.match(commandCockpit, /DEADLINE_FAIL_CLOSED/);
  });

  it("displays narrowed route-lease scope as step permission intersected with authority", () => {
    const scope = narrowRouteLeaseScope({
      requestedPermission: "read",
      workerAuthorityScopes: ["repo:mahoraga:read", "cloud:execute"],
      requestAuthorityScopes: ["repo:mahoraga:read", "cloud:read"],
    });
    assert.equal(scope.permissionClass, "read");
    assert.deepEqual(scope.authorityScopes, ["repo:mahoraga:read"]);
    assert.match(cards, /Route-lease scope/);
    assert.match(cards, /Step permission ∩ worker\/request authority/);
    assert.match(commandCockpit, /LEASE_SCOPE_NARROW/);
  });

  it("surfaces mid-provider lease expiry as HTTP 409, not HTTP 200", () => {
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
    assert.match(cards, /Mid-provider lease expiry/);
    assert.match(cards, /Not HTTP 200/);
    assert.match(cards, /execution-lease-expired/);
    assert.match(commandCockpit, /LEASE_EXPIRY_NOT_200/);
  });

  it("keeps zero-credit exhaustion closed with no metered-route fallthrough", () => {
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
    assert.match(cards, /Zero-credit exhaustion/);
    assert.match(cards, /metered-route fallthrough false/);
    assert.match(commandCockpit, /ZERO_CREDIT_NO_FALLTHROUGH/);
    assert.match(commandCockpit, /BROKER_LEASE_OBS/);
    assert.match(cockpitView, /Universal broker lease \/ deadline/);
    assert.match(cockpitView, /do not grant traffic authority/);
  });
});
