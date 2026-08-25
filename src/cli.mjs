import path from "node:path";
import { loadManifest, ROOT } from "./config.mjs";
import { RuntimeDatabase } from "./database.mjs";
import { startRuntime } from "./runtime.mjs";
import { deriveTaskPolicy, policyTaskInput } from "./task-policy.mjs";
import { createContentVault } from "./content-vault.mjs";

const [command = "start", argument] = process.argv.slice(2);

if (command === "validate") {
  const manifest = await loadManifest();
  console.log(`Manifest valid: ${manifest.product} ${manifest.version} (${manifest.phase})`);
} else if (command === "start") {
  const runtime = await startRuntime();
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

