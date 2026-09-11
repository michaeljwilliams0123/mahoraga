import test from "node:test";
import assert from "node:assert/strict";
import { loadCopilotStudioRuntimeSettings, createCopilotTokenProvider } from "../src/copilot-studio-auth.mjs";

const directEnv = Object.freeze({
  MAHORAGA_COPILOT_DIRECT_CONNECT_URL: "https://runtime-only.example/direct",
  MAHORAGA_COPILOT_TENANT_ID: "tenant-runtime-value",
  MAHORAGA_COPILOT_APP_CLIENT_ID: "client-runtime-value",
});

test("Copilot Studio settings load only runtime bindings and never a client secret", () => {
  const settings = loadCopilotStudioRuntimeSettings(directEnv);
  assert.equal(settings.connectionSettings.directConnectUrl, directEnv.MAHORAGA_COPILOT_DIRECT_CONNECT_URL);
  assert.equal(settings.tenantId, "tenant-runtime-value");
  assert.equal(settings.appClientId, "client-runtime-value");
  assert.equal(Object.hasOwn(settings, "appClientSecret"), false);
  assert.equal(settings.connectionSettings.enableDiagnostics, false);
});

test("Copilot Studio settings require tenant, client, and exactly one connection binding form", () => {
  assert.throws(() => loadCopilotStudioRuntimeSettings({ ...directEnv, MAHORAGA_COPILOT_TENANT_ID: "" }), /copilot-studio-runtime-binding-missing/);
  assert.throws(() => loadCopilotStudioRuntimeSettings({
    MAHORAGA_COPILOT_TENANT_ID: "tenant",
    MAHORAGA_COPILOT_APP_CLIENT_ID: "client",
    MAHORAGA_COPILOT_ENVIRONMENT_ID: "environment",
  }), /copilot-studio-runtime-binding-missing/);
  const settings = loadCopilotStudioRuntimeSettings({
    MAHORAGA_COPILOT_TENANT_ID: "tenant",
    MAHORAGA_COPILOT_APP_CLIENT_ID: "client",
    MAHORAGA_COPILOT_ENVIRONMENT_ID: "environment",
    MAHORAGA_COPILOT_SCHEMA_NAME: "schema",
  });
  assert.equal(settings.connectionSettings.environmentId, "environment");
  assert.equal(settings.connectionSettings.schemaName, "schema");
});

test("silent token acquisition never opens a browser and returns authentication-required safely", async () => {
  let browserCalls = 0;
  class FakePca {
    async getAllAccounts() { return []; }
    async acquireTokenSilent() { throw new Error("token=secret"); }
    async acquireTokenInteractive() { throw new Error("interactive should not run"); }
  }
  const settings = loadCopilotStudioRuntimeSettings(directEnv);
  const provider = createCopilotTokenProvider(settings, {
    PublicClientApplication: FakePca,
    scopeFromSettings: () => "scope/.default",
    openBrowser: async () => { browserCalls += 1; },
  });
  await assert.rejects(() => provider.getToken({ allowInteractive: false }), (error) => error.code === "authentication-required" && !String(error.message).includes("secret"));
  assert.equal(browserCalls, 0);
});

test("token provider prefers silent cached account and exposes only the token to its caller", async () => {
  const calls = [];
  class FakePca {
    async getAllAccounts() { return [{ homeAccountId: "owner" }]; }
    async acquireTokenSilent(request) { calls.push(["silent", request.scopes]); return { accessToken: "short-lived-token" }; }
    async acquireTokenInteractive() { calls.push(["interactive"]); return { accessToken: "wrong" }; }
  }
  const settings = loadCopilotStudioRuntimeSettings(directEnv);
  const provider = createCopilotTokenProvider(settings, { PublicClientApplication: FakePca, scopeFromSettings: () => "scope/.default", openBrowser: async () => {} });
  assert.equal(await provider.getToken({ allowInteractive: false }), "short-lived-token");
  assert.deepEqual(calls, [["silent", ["scope/.default"]]]);
});

test("interactive token acquisition is used only when explicitly allowed", async () => {
  let interactive = 0;
  class FakePca {
    async getAllAccounts() { return []; }
    async acquireTokenInteractive(request) { interactive += 1; await request.openBrowser("https://login.example/"); return { accessToken: "interactive-token" }; }
  }
  let opened = 0;
  const settings = loadCopilotStudioRuntimeSettings(directEnv);
  const provider = createCopilotTokenProvider(settings, { PublicClientApplication: FakePca, scopeFromSettings: () => "scope/.default", openBrowser: async () => { opened += 1; } });
  assert.equal(await provider.getToken({ allowInteractive: true }), "interactive-token");
  assert.equal(interactive, 1);
  assert.equal(opened, 1);
});