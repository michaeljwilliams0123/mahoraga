import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { loadManifest, validateManifest } from "../src/config.mjs";
import {
  executeGoogleWorkspaceCapability,
  extractGoogleWorkspaceUrl,
  GOOGLE_WORKSPACE_HOSTS,
} from "../src/google-workspace-worker.mjs";
import {
  executeSignedChromeCapability,
  extractPublicHttpsUrl,
} from "../src/signed-chrome-worker.mjs";

async function workers() {
  const manifest = await loadManifest();
  return {
    manifest,
    google: manifest.workers.find((item) => item.id === "google-workspace"),
    chrome: manifest.workers.find((item) => item.id === "signed-chrome"),
  };
}

const interactiveChrome = {
  interactive: true,
  sessionId: 1,
  chrome: { visibleWindowCount: 1, installed: true },
};

function spawned(launched) {
  return (executable, args) => {
    launched.push({ executable, args });
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("close", 0));
    return child;
  };
}

test("Google Workspace URL extraction is narrow HTTPS-only", () => {
  assert.deepEqual(GOOGLE_WORKSPACE_HOSTS, [
    "drive.google.com",
    "docs.google.com",
    "sheets.google.com",
    "slides.google.com",
    "mail.google.com",
    "calendar.google.com",
    "meet.google.com",
    "contacts.google.com",
    "chat.google.com",
  ]);
  assert.equal(extractGoogleWorkspaceUrl("Open https://docs.google.com/document/d/secret").hostname, "docs.google.com");
  assert.throws(() => extractGoogleWorkspaceUrl("https://docs.google.com.evil.example/steal"), /google-workspace-approved-url-required/);
  assert.throws(() => extractGoogleWorkspaceUrl("http://docs.google.com/document/d/secret"), /google-workspace-approved-url-required/);
  assert.throws(() => extractGoogleWorkspaceUrl("https://accounts.google.com/"), /google-workspace-approved-url-required/);
});

test("signed Chrome accepts only public HTTPS targets", () => {
  assert.equal(extractPublicHttpsUrl("Open https://example.com/report?q=1").hostname, "example.com");
  for (const blocked of [
    "http://example.com",
    "file:///C:/secret.txt",
    "https://localhost:4782/",
    "https://printer.local/",
    "https://127.0.0.1/",
    "https://10.0.0.1/",
    "https://192.168.1.1/",
    "https://[::1]/",
  ]) assert.throws(() => extractPublicHttpsUrl(`Open ${blocked}`), /chrome-public-https-url-required/);
});

test("Google Workspace open dispatches through attended signed Chrome and stores host-only evidence", async () => {
  const { google } = await workers();
  assert.ok(google);
  const launched = [];
  const result = await executeGoogleWorkspaceCapability(
    "google.open",
    { requestedOutcome: "Open https://drive.google.com/drive/u/0/folders/SecretFolder?token=private" },
    google,
    {
      platform: "win32",
      locateChrome: async () => "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      spawn: spawned(launched),
      run: async () => ({ stdout: JSON.stringify(interactiveChrome), stderr: "" }),
      openVerificationDelayMs: 0,
    },
  );
  assert.equal(result.verified, true);
  assert.equal(launched.length, 1);
  assert.deepEqual(launched[0].args.slice(0, 1), ["--new-tab"]);
  assert.equal(result.providerReceipt.targetHost, "drive.google.com");
  assert.equal(result.providerReceipt.attendedSession, true);
  assert.equal(result.providerReceipt.visibleChrome, true);
  assert.equal(result.providerReceipt.contentAccessVerified, false);
  assert.equal(JSON.stringify(result).includes("SecretFolder"), false);
  assert.equal(JSON.stringify(result).includes("token=private"), false);
});

test("signed Chrome open stores no URL path, query, browser profile, or page-content claim", async () => {
  const { chrome } = await workers();
  assert.ok(chrome);
  const launched = [];
  const result = await executeSignedChromeCapability(
    "chrome.open",
    { requestedOutcome: "Open https://example.com/private/path?q=sensitive" },
    chrome,
    {
      platform: "win32",
      locateChrome: async () => "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      spawn: spawned(launched),
      run: async () => ({ stdout: JSON.stringify(interactiveChrome), stderr: "" }),
      openVerificationDelayMs: 0,
    },
  );
  assert.equal(result.verified, true);
  assert.equal(result.providerReceipt.targetHost, "example.com");
  assert.equal(result.providerReceipt.contentAccessVerified, false);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("private/path"), false);
  assert.equal(serialized.includes("q=sensitive"), false);
  assert.equal(serialized.toLowerCase().includes("cookie"), false);
  assert.equal(serialized.toLowerCase().includes("profile"), false);
});

test("effective manifest exposes Google Workspace and signed Chrome as attended first-class workers and connections", async () => {
  const { manifest, google, chrome } = await workers();
  assert.deepEqual(google.capabilities, ["google.health", "google.open"]);
  assert.equal(google.routing.requiresAttendedDesktop, true);
  assert.equal(google.policy.directGoogleApiAuthentication, false);
  assert.equal(google.policy.remoteDebuggingAllowed, false);
  assert.equal(chrome.routing.requiresAttendedDesktop, true);
  assert.deepEqual(chrome.capabilities, ["chrome.health", "chrome.open"]);
  assert.equal(chrome.policy.remoteDebuggingAllowed, false);
  assert.equal(chrome.policy.profileExportAllowed, false);
  assert.ok(manifest.connections.some((item) => item.id === "google-workspace" && item.capabilities.includes("google.open")));
  assert.ok(manifest.connections.some((item) => item.id === "google-chrome-signed-session" && item.capabilities.includes("chrome.open")));
});

test("effective manifest rejects Google host widening and Chrome debugging/profile-export widening", async () => {
  const manifest = structuredClone(await loadManifest());
  const google = manifest.workers.find((item) => item.id === "google-workspace").policy;
  google.allowedHostSuffixes.push("google.com");
  assert.throws(() => validateManifest(manifest), /Google Workspace adapter boundary/);
  google.allowedHostSuffixes.pop();
  google.directGoogleApiAuthentication = true;
  assert.throws(() => validateManifest(manifest), /Google Workspace adapter boundary/);

  const next = structuredClone(await loadManifest());
  const chrome = next.workers.find((item) => item.id === "signed-chrome").policy;
  chrome.remoteDebuggingAllowed = true;
  assert.throws(() => validateManifest(next), /Signed Chrome adapter boundary/);
  chrome.remoteDebuggingAllowed = false;
  chrome.profileExportAllowed = true;
  assert.throws(() => validateManifest(next), /Signed Chrome adapter boundary/);
});

test("signed Chrome implementation cannot introduce DevTools/CDP or browser-state export", async () => {
  const source = await readFile(new URL("../src/signed-chrome-worker.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /remote-debugging|DevToolsActivePort|9222|chrome-debugging|user-data-dir|profile-directory|document\.cookie|Login Data|Cookies/i);
});
