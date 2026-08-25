import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { loadManifest, validateManifest } from "../src/config.mjs";
import { executeMicrosoft365Capability, extractMicrosoftUrl, probeMicrosoft365 } from "../src/microsoft365-worker.mjs";

async function worker() { return (await loadManifest()).workers.find((item) => item.id === "microsoft365"); }
const session = { interactive: true, sessionId: 1, applications: [{ process: "chrome", windowCount: 1 }, { process: "olk", windowCount: 1 }], oneDriveRootCount: 1, installedOfficeApplicationCount: 5 };

test("Microsoft 365 URL extraction permits only approved HTTPS host suffixes", () => {
  assert.equal(extractMicrosoftUrl("Review https://vaco.sharepoint.com/sites/Finance/Doc.docx").hostname, "vaco.sharepoint.com");
  assert.throws(() => extractMicrosoftUrl("https://sharepoint.com.evil.example/steal"), /approved-url-required/);
  assert.throws(() => extractMicrosoftUrl("http://vaco.sharepoint.com/file"), /approved-url-required/);
});

test("Microsoft 365 health reports bounded signed-application and Power Platform readiness", async () => {
  const item = await worker();
  const result = await probeMicrosoft365(item.adapter, {
    platform: "win32",
    run: async () => ({ stdout: JSON.stringify(session), stderr: "" }),
    runPac: async () => ({ stdout: "[1]   * UNIVERSAL profile Public OperatingSystem", stderr: "" }),
  });
  assert.equal(result.verified, true);
  assert.equal(result.providerHealth.visibleApplicationTypes, 2);
  assert.equal(result.providerHealth.dataverseProfileAuthenticated, true);
  assert.equal(result.providerHealth.directGraphAuthentication, false);
  assert.equal(JSON.stringify(result).includes("Finance"), false);
});

test("Microsoft 365 open uses the attended default browser and stores only the target host", async () => {
  const item = await worker();
  const launched = [];
  const result = await executeMicrosoft365Capability("m365.open", { requestedOutcome: "Open https://vaco.sharepoint.com/sites/Finance/Secret.docx" }, item, {
    spawn: (executable, args) => {
      launched.push({ executable, args });
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("close", 0));
      return child;
    },
    run: async () => ({ stdout: JSON.stringify(session), stderr: "" }),
    openVerificationDelayMs: 0,
  });
  assert.equal(result.verified, true);
  assert.equal(launched[0].executable, "rundll32.exe");
  assert.equal(result.providerReceipt.targetHost, "vaco.sharepoint.com");
  assert.equal(JSON.stringify(result).includes("Secret.docx"), false);
  assert.equal(result.providerReceipt.contentAccessVerified, false);
});

test("manifest rejects Microsoft 365 host or Graph-auth widening", async () => {
  const manifest = structuredClone(await loadManifest());
  const adapter = manifest.workers.find((item) => item.id === "microsoft365").adapter;
  adapter.allowedHostSuffixes.push("example.com");
  assert.throws(() => validateManifest(manifest), /Microsoft 365 adapter boundary/);
  adapter.allowedHostSuffixes.pop();
  adapter.directGraphAuthentication = true;
  assert.throws(() => validateManifest(manifest), /Microsoft 365 adapter boundary/);
});
