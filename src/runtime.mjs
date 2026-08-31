import path from "node:path";
import { loadManifest, ROOT } from "./config.mjs";
import { RuntimeDatabase } from "./database.mjs";
import { Supervisor } from "./supervisor.mjs";
import { createControlServer } from "./server.mjs";
import { loadPrimaryCodexToken } from "./local-auth.mjs";
import { LocalArtifactStore } from "./local-artifact-store.mjs";
import { createControlSessionManager } from "./control-session.mjs";
import { createContentVault } from "./content-vault.mjs";
import { createRelayRuntimePeer } from "./relay-runtime.mjs";
import { createMcpHostManager } from "./mcp-host-manager.mjs";

export async function startRuntime({ port, databaseFile, artifactRoot, contentVaultRoot, contentVaultKeyFile, contentVaultMasterKey = null, primaryCodexToken: suppliedPrimaryCodexToken = null, syncCoordinationMailbox = true, webRoot, relay = null, mcpTransports = {} } = {}) {
  const manifest = await loadManifest();
  const resolvedDatabaseFile = databaseFile ?? path.join(ROOT, manifest.runtime.database);
  const stateRoot = path.dirname(resolvedDatabaseFile);
  const resolvedContentVaultRoot = contentVaultRoot ?? (databaseFile ? path.join(stateRoot, "content-vault") : path.join(ROOT, manifest.truthContracts.contentVault.root));
  const resolvedContentVaultKeyFile = contentVaultKeyFile ?? path.join(stateRoot, "content-vault.key.dpapi");
  const contentVault = await createContentVault({ root: resolvedContentVaultRoot, keyFile: resolvedContentVaultKeyFile, masterKey: contentVaultMasterKey });
  contentVault.deleteExpired();
  const database = new RuntimeDatabase(resolvedDatabaseFile, { contentVault });
  const resolvedArtifactRoot = artifactRoot ?? path.join(path.dirname(resolvedDatabaseFile), "artifacts");
  const artifactStore = new LocalArtifactStore(resolvedArtifactRoot, { contentVault });
  const supervisor = new Supervisor({ manifest, database, artifactRoot: resolvedArtifactRoot, contentVaultRoot: resolvedContentVaultRoot, contentVaultKeyFile: resolvedContentVaultKeyFile, syncCoordinationMailbox });
  const primaryCodexToken = suppliedPrimaryCodexToken ?? await loadPrimaryCodexToken();
  const controlSessions = createControlSessionManager({
    idleTtlMs: manifest.truthContracts.controlSession.idleTtlMs,
    nonceTtlMs: manifest.truthContracts.controlSession.bootstrapNonceTtlMs,
  });
  const mcpHost = createMcpHostManager({ declarations: manifest.mcpProviders ?? [], transports: mcpTransports });
  await mcpHost.refresh();
  const resolvedPort = port ?? manifest.runtime.port;
  supervisor.start();
  const server = createControlServer({
    manifest, database, supervisor, primaryCodexToken, artifactStore, contentVault, controlSessions, mcpHost,
    controlOrigin: resolvedPort === 0 ? null : `http://${manifest.runtime.host}:${resolvedPort}`, webRoot,
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(resolvedPort, manifest.runtime.host, resolve);
  });
  const address = server.address();
  let relayRuntime = null;
  if (relay) {
    relayRuntime = typeof relay.connect === "function" ? relay : createRelayRuntimePeer({ ...relay, gateway: server.conversationGateway });
    await relayRuntime.connect();
  }
  const stop = async () => {
    relayRuntime?.close();
    supervisor.stop();
    await new Promise((resolve) => server.close(resolve));
    database.close();
  };
  return { manifest, database, artifactStore, contentVault, supervisor, server, controlSessions, mcpHost, relayRuntime, address, stop };
}
