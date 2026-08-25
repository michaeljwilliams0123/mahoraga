import path from "node:path";
import { loadManifest, ROOT } from "./config.mjs";
import { RuntimeDatabase } from "./database.mjs";
import { Supervisor } from "./supervisor.mjs";
import { createControlServer } from "./server.mjs";
import { loadPrimaryCodexToken } from "./local-auth.mjs";
import { LocalArtifactStore } from "./local-artifact-store.mjs";

export async function startRuntime({ port, databaseFile, artifactRoot, syncCoordinationMailbox = true, webRoot } = {}) {
  const manifest = await loadManifest();
  const resolvedDatabaseFile = databaseFile ?? path.join(ROOT, manifest.runtime.database);
  const database = new RuntimeDatabase(resolvedDatabaseFile);
  const resolvedArtifactRoot = artifactRoot ?? path.join(path.dirname(resolvedDatabaseFile), "artifacts");
  const artifactStore = new LocalArtifactStore(resolvedArtifactRoot);
  const supervisor = new Supervisor({ manifest, database, artifactRoot: resolvedArtifactRoot, syncCoordinationMailbox });
  const primaryCodexToken = await loadPrimaryCodexToken();
  supervisor.start();
  const server = createControlServer({ manifest, database, supervisor, primaryCodexToken, artifactStore, webRoot });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port ?? manifest.runtime.port, manifest.runtime.host, resolve);
  });
  const address = server.address();
  const stop = async () => {
    supervisor.stop();
    await new Promise((resolve) => server.close(resolve));
    database.close();
  };
  return { manifest, database, artifactStore, supervisor, server, address, stop };
}
