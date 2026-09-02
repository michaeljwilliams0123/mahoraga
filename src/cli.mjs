import path from "node:path";
import { loadManifest, ROOT } from "./config.mjs";
import { RuntimeDatabase } from "./database.mjs";
import { startRuntime } from "./runtime.mjs";
import { deriveTaskPolicy, policyTaskInput } from "./task-policy.mjs";
import { createContentVault } from "./content-vault.mjs";
import { createPairingOffer } from "./relay-client.mjs";

const [command = "start", argument] = process.argv.slice(2);

if (command === "validate") {
  const manifest = await loadManifest();
  console.log(`Manifest valid: ${manifest.product} ${manifest.version} (${manifest.phase})`);
} else if (command === "start") {
  const localAccessToken = process.env.MAHORAGA_RELAY_LOCAL_ACCESS_TOKEN ?? null;
  if (localAccessToken !== null && !/^[A-Za-z0-9_-]{32,256}$/.test(localAccessToken)) throw new TypeError("relay-runtime-access-token-invalid");
  const pairing = localAccessToken ? await createPairingOffer() : null;
  if (pairing) console.log(`Mahoraga relay pairing offer: ${Buffer.from(JSON.stringify(pairing.publicOffer)).toString("base64url")}`);
  const runtime = await startRuntime({ relay: pairing ? { pairing, localAccessToken } : null });
  console.log(`Mahoraga ${runtime.manifest.version} is ready at http://${runtime.address.address}:${runtime.address.port}`);
  const shutdown = async () => { await runtime.stop(); process.exit(0); };
  process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
} else if (command === "status" || command === "submit") {
  const manifest = await loadManifest();
  const databaseFile = path.join(ROOT, manifest.runtime.database);
  const stateRoot = path.dirname(databaseFile);
  const contentVault = await createContentVault({ root: path.join(stateRoot, "content-vault"), keyFile: path.join(stateRoot, "content-vault.key.dpapi") });
  const database = new RuntimeDatabase(databaseFile, { contentVault });
  try {
    if (command === "status") console.log(JSON.stringify({ tasks: database.listTasks(20), workers: database.listWorkerState(), improvements: database.listImprovements() }, null, 2));
    else {
      const request = { intent: argument ?? "system.health", requestedOutcome: `Run ${argument ?? "system.health"}` };
      const policy = deriveTaskPolicy(request, { manifest, source: "cli", internal: true, integrationLease: database.getIntegrationLease() });
      console.log(JSON.stringify(database.submitPolicyTask(policyTaskInput(request, policy, manifest)), null, 2));
    }
  } finally { database.close(); }
} else {
  console.error("Usage: node src/cli.mjs [start|validate|status|submit <capability>]");
  process.exitCode = 2;
}
