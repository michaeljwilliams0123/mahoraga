import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PublicClientApplication as MsalPublicClientApplication } from "@azure/msal-node";
import { ConnectionSettings, CopilotStudioClient } from "@microsoft/agents-copilotstudio-client";

const execFileAsync = promisify(execFile);

export function loadCopilotStudioRuntimeSettings(env = process.env) {
  const directConnectUrl = value(env.MAHORAGA_COPILOT_DIRECT_CONNECT_URL);
  const environmentId = value(env.MAHORAGA_COPILOT_ENVIRONMENT_ID);
  const schemaName = value(env.MAHORAGA_COPILOT_SCHEMA_NAME);
  const tenantId = value(env.MAHORAGA_COPILOT_TENANT_ID);
  const appClientId = value(env.MAHORAGA_COPILOT_APP_CLIENT_ID);
  if (!tenantId || !appClientId || (!directConnectUrl && !(environmentId && schemaName))) throw safeError("copilot-studio-runtime-binding-missing");
  const connectionSettings = new ConnectionSettings({
    directConnectUrl: directConnectUrl || undefined,
    environmentId: environmentId || undefined,
    schemaName: schemaName || undefined,
    appClientId,
    tenantId,
    authority: "https://login.microsoftonline.com",
    enableDiagnostics: false,
  });
  return Object.freeze({ connectionSettings, tenantId, appClientId });
}

export function createCopilotTokenProvider(settings, dependencies = {}) {
  if (!settings?.connectionSettings || !settings?.tenantId || !settings?.appClientId) throw new TypeError("copilot-studio-auth-settings-invalid");
  const PublicClientApplication = dependencies.PublicClientApplication ?? MsalPublicClientApplication;
  const scopeFromSettings = dependencies.scopeFromSettings ?? ((connectionSettings) => CopilotStudioClient.scopeFromSettings(connectionSettings));
  const openBrowser = dependencies.openBrowser ?? defaultOpenBrowser;
  const scopes = Object.freeze([scopeFromSettings(settings.connectionSettings)]);
  const client = new PublicClientApplication({
    auth: {
      clientId: settings.appClientId,
      authority: `https://login.microsoftonline.com/${settings.tenantId}`,
    },
    system: { loggerOptions: { piiLoggingEnabled: false } },
  });

  return Object.freeze({
    async getToken({ allowInteractive = false } = {}) {
      try {
        const accounts = await client.getAllAccounts();
        if (Array.isArray(accounts) && accounts.length > 0) {
          try {
            const silent = await client.acquireTokenSilent({ account: accounts[0], scopes });
            if (silent?.accessToken) return silent.accessToken;
          } catch {
            if (!allowInteractive) throw safeError("authentication-required");
          }
        } else if (!allowInteractive) {
          throw safeError("authentication-required");
        }
        if (!allowInteractive) throw safeError("authentication-required");
        const interactive = await client.acquireTokenInteractive({ scopes, openBrowser });
        if (!interactive?.accessToken) throw safeError("authentication-required");
        return interactive.accessToken;
      } catch (error) {
        if (error?.code === "authentication-required") throw error;
        throw safeError("authentication-required");
      }
    },
  });
}

async function defaultOpenBrowser(url) {
  const parsed = new URL(String(url));
  if (parsed.protocol !== "https:") throw safeError("authentication-required");
  await execFileAsync("rundll32.exe", ["url.dll,FileProtocolHandler", parsed.href], { windowsHide: true, timeout: 15000, maxBuffer: 32 * 1024 });
}

function value(input) {
  return typeof input === "string" ? input.trim() : "";
}

function safeError(code) {
  return Object.assign(new Error(code), { code });
}