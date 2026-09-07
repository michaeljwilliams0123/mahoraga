import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const DEFAULT_LEASE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAXIMUM_BYTES = 2 * 1024 * 1024;
const MAX_LEASE_TTL_MS = 15 * 60 * 1000;
const MAX_TIMEOUT_MS = 60_000;
const OWNER_AUTHORITY = "owner-approved-public-internet-read";

export function createInternetEgressController({
  now = () => new Date(),
  resolveHost = defaultResolveHost,
  fetchImpl = globalThis.fetch,
  leaseTtlMs = DEFAULT_LEASE_TTL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maximumBytes = DEFAULT_MAXIMUM_BYTES,
} = {}) {
  if (typeof now !== "function") fail("egress-clock-invalid");
  if (typeof resolveHost !== "function") fail("egress-resolver-invalid");
  if (typeof fetchImpl !== "function") fail("egress-fetch-invalid");
  integerRange(leaseTtlMs, 1, MAX_LEASE_TTL_MS, "egress-lease-ttl-invalid");
  integerRange(timeoutMs, 1, MAX_TIMEOUT_MS, "egress-timeout-invalid");
  integerRange(maximumBytes, 1, DEFAULT_MAXIMUM_BYTES, "egress-size-limit-invalid");

  const leases = new Map();

  function checkOut({ objectiveId, purpose, url } = {}) {
    boundedText(objectiveId, 1, 160, "egress-objective-required");
    boundedText(purpose, 1, 1024, "egress-purpose-required");
    const target = normalizePublicHttpsUrl(url);
    const checkedOutAt = instant(now(), "egress-clock-invalid");
    const expiresAt = new Date(Date.parse(checkedOutAt) + leaseTtlMs).toISOString();
    const leaseId = `egress-${randomUUID()}`;
    const record = {
      leaseId,
      objectiveId,
      purpose,
      purposeSha256: digest(Buffer.from(purpose, "utf8")),
      targetUrl: target.href,
      targetHost: target.hostname,
      checkedOutAt,
      expiresAt,
      state: "checked-out",
      read: null,
    };
    leases.set(leaseId, record);
    return freezeLease(record);
  }

  async function read(leaseId) {
    const lease = requireOpenLease(leases, leaseId, now);
    const target = new URL(lease.targetUrl);
    const addresses = normalizeAddresses(await resolveHost(target.hostname));
    if (addresses.length === 0) fail("egress-resolution-empty");
    if (addresses.some(({ address }) => privateOrReservedAddress(address))) fail("egress-private-target");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();
    let response;
    try {
      response = await fetchImpl(target.href, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: Object.freeze({
          accept: "*/*",
          "user-agent": "Mahoraga-Internet-Egress/1",
        }),
      });
    } catch (error) {
      const wrapped = typed("egress-fetch-failed");
      wrapped.cause = error;
      throw wrapped;
    } finally {
      clearTimeout(timer);
    }

    if (!response || !Number.isInteger(response.status)) fail("egress-response-invalid");
    if (response.status >= 300 && response.status < 400) fail("egress-redirect-not-approved");
    const declaredLength = numericHeader(response.headers, "content-length");
    if (declaredLength !== null && declaredLength > maximumBytes) fail("egress-response-too-large");

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maximumBytes) fail("egress-response-too-large");
    const observedAt = instant(now(), "egress-clock-invalid");
    const metadata = Object.freeze({
      schemaVersion: 1,
      kind: "internet-egress-read",
      leaseId: lease.leaseId,
      objectiveId: lease.objectiveId,
      targetHost: lease.targetHost,
      status: response.status,
      sha256: digest(bytes),
      sizeBytes: bytes.length,
      contentType: boundedHeader(response.headers?.get?.("content-type")),
      observedAt,
      creditCost: 0,
      paidFallback: false,
    });
    lease.read = metadata;
    return Object.freeze({ ...metadata, bytes });
  }

  function checkIn(leaseId, result) {
    const lease = requireOpenLease(leases, leaseId, now);
    if (!lease.read) fail("egress-read-required");
    if (!result || typeof result !== "object" || Buffer.isBuffer(result)) fail("egress-result-invalid");
    if (result.leaseId !== lease.leaseId || result.sha256 !== lease.read.sha256 || result.sizeBytes !== lease.read.sizeBytes || result.status !== lease.read.status) fail("egress-result-mismatch");
    if (!Buffer.isBuffer(result.bytes) || result.bytes.length !== result.sizeBytes || digest(result.bytes) !== result.sha256) fail("egress-result-mismatch");

    const checkedInAt = instant(now(), "egress-clock-invalid");
    lease.state = "checked-in";
    const receipt = Object.freeze({
      schemaVersion: 1,
      kind: "internet-egress-check-in",
      state: "checked-in",
      leaseId: lease.leaseId,
      objectiveId: lease.objectiveId,
      targetHost: lease.targetHost,
      purposeSha256: lease.purposeSha256,
      checkedOutAt: lease.checkedOutAt,
      checkedInAt,
      status: lease.read.status,
      sha256: lease.read.sha256,
      sizeBytes: lease.read.sizeBytes,
      authority: OWNER_AUTHORITY,
      creditCost: 0,
      paidFallback: false,
    });
    lease.receipt = receipt;
    return receipt;
  }

  return Object.freeze({ checkOut, read, checkIn });
}

async function defaultResolveHost(hostname) {
  return lookup(hostname, { all: true, verbatim: true });
}

function requireOpenLease(leases, leaseId, now) {
  if (typeof leaseId !== "string" || !leaseId.startsWith("egress-")) fail("egress-lease-not-found");
  const lease = leases.get(leaseId);
  if (!lease) fail("egress-lease-not-found");
  if (lease.state !== "checked-out") fail("egress-lease-closed");
  if (Date.parse(instant(now(), "egress-clock-invalid")) >= Date.parse(lease.expiresAt)) fail("egress-lease-expired");
  return lease;
}

function normalizePublicHttpsUrl(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 2048 || /[\0\r\n]/.test(value)) fail("egress-url-invalid");
  let target;
  try { target = new URL(value); } catch { fail("egress-url-invalid"); }
  if (target.protocol !== "https:") fail("egress-https-required");
  if (target.username || target.password) fail("egress-userinfo-forbidden");
  if (target.hash) target.hash = "";
  const host = target.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || privateOrReservedAddress(stripIpv6Brackets(host))) fail("egress-private-target");
  return target;
}

function normalizeAddresses(value) {
  const values = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  return values.map((entry) => ({ address: String(entry?.address ?? "") })).filter((entry) => isIP(entry.address) !== 0);
}

function privateOrReservedAddress(value) {
  const address = stripIpv6Brackets(String(value ?? "").toLowerCase());
  const family = isIP(address);
  if (family === 0) return false;
  if (family === 6) {
    if (address === "::" || address === "::1") return true;
    if (address.startsWith("fc") || address.startsWith("fd")) return true;
    if (/^fe[89ab]/.test(address)) return true;
    if (address.startsWith("::ffff:")) return privateOrReservedAddress(address.slice(7));
    return false;
  }
  const [a, b] = address.split(".").map(Number);
  return a === 0
    || a === 10
    || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function freezeLease(record) {
  return Object.freeze({
    schemaVersion: 1,
    kind: "internet-egress-lease",
    leaseId: record.leaseId,
    objectiveId: record.objectiveId,
    purposeSha256: record.purposeSha256,
    targetHost: record.targetHost,
    method: "GET",
    state: record.state,
    authority: OWNER_AUTHORITY,
    checkedOutAt: record.checkedOutAt,
    expiresAt: record.expiresAt,
    creditCost: 0,
    paidFallback: false,
  });
}

function numericHeader(headers, name) {
  const raw = headers?.get?.(name);
  if (raw == null || raw === "") return null;
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : null;
}

function boundedHeader(value) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text || text.length > 200 || /[\0\r\n]/.test(text)) return null;
  return text;
}

function boundedText(value, minimum, maximum, code) {
  if (typeof value !== "string" || value.trim().length < minimum || value.length > maximum || /[\0\r\n]/.test(value)) fail(code);
}

function integerRange(value, minimum, maximum, code) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) fail(code);
}

function instant(value, code) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) fail(code);
  return date.toISOString();
}

function stripIpv6Brackets(value) {
  return value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function typed(code) {
  const error = new TypeError(code);
  error.code = code;
  return error;
}

function fail(code) {
  throw typed(code);
}
