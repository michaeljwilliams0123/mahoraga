import path from "node:path";
import { loadManifest, ROOT } from "./config.mjs";
import { RuntimeDatabase } from "./database.mjs";
import { Supervisor } from "./supervisor.mjs";
import { createControlServer } from "./server.mjs";
import { loadPrimaryCodexToken } from "./local-auth.mjs";

export async function startRuntime({ port, databaseFile, syncCoordinationMailbox = true, webRoot } = {}) {
  const manifest = await loadManifest();
  const database = new RuntimeDatabase(databaseFile ?? path.join(ROOT, manifest.runtime.database));
  const supervisor = new Supervisor({ manifest, database, syncCoordinationMailbox });
  const primaryCodexToken = await loadPrimaryCodexToken();
  supervisor.start();
  const server = createControlServer({ manifest, database, supervisor, primaryCodexToken, webRoot });
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
  return { manifest, database, supervisor, server, address, stop };
}
