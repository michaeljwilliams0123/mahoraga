import test from "node:test";
import assert from "node:assert/strict";
import {
  executeMicrosoftQueueCapability,
  parseAuthDiagnosis,
  sanitizeQueuePollReceipt,
} from "../src/microsoft-queue-worker.mjs";

const READY_ENV = [
  "PUBLISHER_PREFIX=mhg",
  "DATAVERSE_URL=https://example.crm.dynamics.com/",
  "TENANT_ID=00000000-0000-0000-0000-000000000000",
].join("\n");

const fileStat = { isFile: () => true };

test("Dataverse auth diagnosis distinguishes silent readiness from interactive fallback", () => {
  assert.deepEqual(
    parseAuthDiagnosis("Result: a silent tier is available -- normal calls will not prompt.\n"),
    { silentAuthAvailable: true, diagnosis: "silent-tier-available" },
  );
  assert.deepEqual(
    parseAuthDiagnosis("Result: no silent tier -- the next call uses the 'interactive-browser' interactive tier.\n"),
    { silentAuthAvailable: false, diagnosis: "interactive-required" },
  );
  assert.deepEqual(
    parseAuthDiagnosis("diagnostic output changed"),
    { silentAuthAvailable: false, diagnosis: "indeterminate" },
  );
});

test("queue status fails closed without configuration and never starts authentication", async () => {
  let ran = false;
  const result = await executeMicrosoftQueueCapability("queue.status", {
    readFileImpl: async () => "",
    statImpl: async () => fileStat,
    runPythonImpl: async () => { ran = true; throw new Error("must-not-run"); },
  });
  assert.equal(ran, false);
  assert.equal(result.verified, false);
  assert.equal(result.prefixReady, false);
  assert.equal(result.receiptMetadata.silentAuthAvailable, false);
  assert.equal(result.receiptMetadata.authDiagnosis, "not-probed");
});

test("queue status requires a working silent Dataverse credential for unattended readiness", async () => {
  const calls = [];
  const result = await executeMicrosoftQueueCapability("queue.status", {
    readFileImpl: async () => READY_ENV,
    statImpl: async () => fileStat,
    runPythonImpl: async (args, timeoutMs) => {
      calls.push({ args, timeoutMs });
      return { stdout: "Result: a silent tier is available -- normal calls will not prompt.\n", stderr: "" };
    },
  });
  assert.equal(result.verified, true);
  assert.equal(result.receiptMetadata.dataverseUrlConfigured, true);
  assert.equal(result.receiptMetadata.tenantConfigured, true);
  assert.equal(result.receiptMetadata.silentAuthAvailable, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(
    calls[0].args.slice(-2).map((value) => value.replaceAll("\\", "/")),
    ["scripts/auth.py", "--diagnose"],
  );
  assert.equal(calls[0].timeoutMs, 20000);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("example.crm.dynamics.com"), false);
  assert.equal(serialized.includes("00000000-0000"), false);
});

test("queue status reports configured-but-blocked when only interactive authentication remains", async () => {
  const result = await executeMicrosoftQueueCapability("queue.status", {
    readFileImpl: async () => READY_ENV,
    statImpl: async () => fileStat,
    runPythonImpl: async () => ({
      stdout: "Result: no silent tier -- the next call uses the 'device-code' interactive tier.\n",
      stderr: "",
    }),
  });
  assert.equal(result.verified, false);
  assert.equal(result.receiptMetadata.authDiagnosis, "interactive-required");
});

test("queue poll receipt is strict, bounded, and drops untrusted extra fields", async () => {
  const clean = sanitizeQueuePollReceipt({
    verified: true,
    claimed: 2,
    completed: 3,
    requeued: 1,
    relay: "primary-windows",
    accessToken: "must-not-survive",
  });
  assert.deepEqual(clean, {
    verified: true,
    claimed: 2,
    completed: 3,
    requeued: 1,
    relay: "primary-windows",
  });

  const result = await executeMicrosoftQueueCapability("queue.poll", {
    runPythonImpl: async () => ({
      stdout: `${JSON.stringify({ verified: true, claimed: 1, completed: 0, requeued: 0, relay: "primary-windows", document: "private" })}\n`,
      stderr: "",
    }),
  });
  assert.equal(result.verified, true);
  assert.deepEqual(result.receiptMetadata, {
    verified: true,
    claimed: 1,
    completed: 0,
    requeued: 0,
    relay: "primary-windows",
  });
  assert.equal(JSON.stringify(result).includes("private"), false);
});

test("queue poll rejects malformed relay receipts", () => {
  assert.throws(
    () => sanitizeQueuePollReceipt({ verified: true, claimed: 0, completed: 0, requeued: 0, relay: "other" }),
    /microsoft-queue-invalid-receipt/,
  );
});
