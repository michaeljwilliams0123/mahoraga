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
import { installObjectiveReleaseAuthority } from "./objective-release-authority.mjs";
import { resolveCandidateRuntimePaths } from "./state/candidate-runtime.mjs";
import { openUccpStateStore } from "./state/schema.mjs";
import { createAdminCognitivePlane } from "./state/core-plane.mjs";
import { ContainmentWatchdog, createUccpCanary } from "./state/watchdog.mjs";
import { createEmergencyRollback } from "./state/rollback.mjs";
import { createPgaTelemetryRegistry, installPgaTelemetryRoute } from "./relay/pga-status.mjs";

export async function startRuntime({ port, databaseFile, artifactRoot, contentVaultRoot, contentVaultKeyFile, contentVaultMasterKey = null, primaryCodexToken: suppliedPrimaryCodexToken = null, syncCoordinationMailbox = true, webRoot, relay = null, mcpTransports = {}, repositoryHeadReader } = {}) {
  const manifest = await loadManifest();
  const resolvedPort = port ?? manifest.runtime.port;
  const paths = resolveCandidateRuntimePaths({
    root: ROOT, manifest, port: resolvedPort, databaseFile, artifactRoot, contentVaultRoot, contentVaultKeyFile,
  });
  const contentVault = await createContentVault({ root: paths.contentVaultRoot, keyFile: paths.contentVaultKeyFile, masterKey: contentVaultMasterKey });
  contentVault.deleteExpired();
  const database = new RuntimeDatabase(paths.databaseFile, { contentVault });
  const objectiveReleaseAuthority = installObjectiveReleaseAuthority({ database, manifest });
  const artifactStore = new LocalArtifactStore(paths.artifactRoot, { contentVault });
  const supervisor = new Supervisor({
    manifest, database, artifactRoot: paths.artifactRoot, contentVaultRoot: paths.contentVaultRoot,
    contentVaultKeyFile: paths.contentVaultKeyFile, syncCoordinationMailbox,
  });
  const primaryCodexToken = suppliedPrimaryCodexToken ?? await loadPrimaryCodexToken();
  const controlSessions = createControlSessionManager({
    idleTtlMs: manifest.truthContracts.controlSession.idleTtlMs,
    nonceTtlMs: manifest.truthContracts.controlSession.bootstrapNonceTtlMs,
  });
  const mcpHost = createMcpHostManager({ declarations: manifest.mcpProviders ?? [], transports: mcpTransports });
  await mcpHost.refresh();
  const pgaTelemetryRegistry = paths.candidate ? createPgaTelemetryRegistry() : null;

  supervisor.start();
  const server = createControlServer({
    manifest, database, supervisor, primaryCodexToken, artifactStore, contentVault, controlSessions, mcpHost,
    controlOrigin: resolvedPort === 0 ? null : `http://${manifest.runtime.host}:${resolvedPort}`, webRoot,
    ...(repositoryHeadReader ? { repositoryHeadReader } : {}),
  });
  if (pgaTelemetryRegistry) installPgaTelemetryRoute(server, { primaryToken: primaryCodexToken, sessions: controlSessions, registry: pgaTelemetryRegistry });
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

  let uccp = null;
  if (paths.candidate) {
    const stateStore = openUccpStateStore({ file: paths.uccpDatabaseFile });
    const plane = createAdminCognitivePlane({
      port: 4783,
      stateStore,
      telemetryRegistry: pgaTelemetryRegistry,
      snapshot: async () => {
        const workers = database.listWorkerState();
        const tasks = database.listTasks(50);
        const unhealthy = workers.some((worker) => !["ready", "healthy", "idle", "busy", "starting"].includes(String(worker?.status ?? "").toLowerCase()));
        return { workers, tasks, driftRisk: unhealthy ? "ELEVATED" : "STABLE" };
      },
    });
    const rollback = createEmergencyRollback({ root: ROOT, candidateStateDirectory: paths.stateRoot });
    const watchdog = new ContainmentWatchdog({
      port: 4783,
      intervalMs: 500,
      failureThreshold: 3,
      check: createUccpCanary({ stateStore, root: ROOT }),
      rollback,
      telemetryRegistry: pgaTelemetryRegistry,
    });
    plane.start();
    watchdog.start();
    uccp = Object.freeze({ stateStore, plane, watchdog, telemetryRegistry: pgaTelemetryRegistry, stateRoot: paths.stateRoot });
  }

  const stop = async () => {
    relayRuntime?.close();
    uccp?.watchdog.stop();
    uccp?.plane.stop();
    supervisor.stop();
    await new Promise((resolve) => server.close(resolve));
    objectiveReleaseAuthority.restore();
    database.close();
    uccp?.stateStore.close();
  };
  return { manifest, database, artifactStore, contentVault, supervisor, server, controlSessions, mcpHost, relayRuntime, pgaTelemetryRegistry, uccp, address, stop };
}