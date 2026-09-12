import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadManifest, ROOT } from "./config.mjs";
import { RuntimeDatabase } from "./database.mjs";
import { startRuntime } from "./runtime.mjs";
import { deriveTaskPolicy, policyTaskInput } from "./task-policy.mjs";
import { createContentVault } from "./content-vault.mjs";
import { createPairingOffer } from "./relay-client.mjs";
import { parseCliArguments } from "./cli-arguments.mjs";
import { resolveCandidateRuntimePaths } from "./state/candidate-runtime.mjs";

const { command, argument, port } = parseCliArguments(process.argv.slice(2), process.env);

if (command === "validate") {
  const manifest = await loadManifest();
  console.log(`Manifest valid: ${manifest.product}; build ${manifest.version}; phase ${manifest.phase}`);
} else if (command === "start") {
  const localAccessToken = process.env.MAHORAGA_RELAY_LOCAL_ACCESS_TOKEN ?? null;
  if (localAccessToken !== null && !/^[A-Za-z0-9_-]{32,256}$/.test(localAccessToken)) throw new TypeError("relay-runtime-access-token-invalid");
  const manifest = await loadManifest();
  const resolvedPort = port ?? manifest.runtime.port;
  const vaultKey = process.env.MAHORAGA_CONTENT_VAULT_MASTER_KEY?.trim();
  const paths = resolveCandidateRuntimePaths({
    root: ROOT,
    manifest,
    port: resolvedPort,
    ...(process.env.MAHORAGA_DATABASE_FILE ? { databaseFile: process.env.MAHORAGA_DATABASE_FILE } : {}),
    ...(process.env.MAHORAGA_ARTIFACT_ROOT ? { artifactRoot: process.env.MAHORAGA_ARTIFACT_ROOT } : {}),
    ...(process.env.MAHORAGA_CONTENT_VAULT_ROOT ? { contentVaultRoot: process.env.MAHORAGA_CONTENT_VAULT_ROOT } : {}),
  });
  const contentVault = localAccessToken ? await createContentVault({
    root: paths.contentVaultRoot,
    keyFile: paths.contentVaultKeyFile,
    ...(vaultKey ? { masterKey: Buffer.from(vaultKey, "base64") } : {}),
  }) : null;
  const sessionStateStore = contentVault ? createRelaySessionStateStore({
    contentVault,
    referenceFile: path.join(paths.stateRoot, "relay-session.vaultref"),
    deviceId: "primary-windows",
  }) : null;
  const pairing = localAccessToken ? await createPairingOffer() : null;
  if (pairing) console.log(`Mahoraga relay pairing offer: ${Buffer.from(JSON.stringify(pairing.publicOffer)).toString("base64url")}`);
  const runtime = await startRuntime({ relay: pairing ? { pairing, localAccessToken, sessionStateStore } : null,
    ...(port !== null ? { port } : {}),
    ...(process.env.MAHORAGA_DATABASE_FILE ? { databaseFile: process.env.MAHORAGA_DATABASE_FILE } : {}),
    ...(process.env.MAHORAGA_ARTIFACT_ROOT ? { artifactRoot: process.env.MAHORAGA_ARTIFACT_ROOT } : {}),
    ...(process.env.MAHORAGA_CONTENT_VAULT_ROOT ? { contentVaultRoot: process.env.MAHORAGA_CONTENT_VAULT_ROOT } : {}),
    ...(vaultKey ? { contentVaultMasterKey: Buffer.from(vaultKey, "base64") } : {}),
  });
  console.log(`Mahoraga is ready at http://${runtime.address.address}:${runtime.address.port}${runtime.uccp ? " [UCCP candidate isolated]" : ""}`);
  const shutdown = async () => { await runtime.stop(); process.exit(0); };
  process.on("SIGINT", shutdown); process.on("SIGTERM", shutdown);
} else if (command === "status" || command === "submit") {
  const manifest = await loadManifest();
  const databaseFile = process.env.MAHORAGA_DATABASE_FILE ? path.resolve(process.env.MAHORAGA_DATABASE_FILE) : path.join(ROOT, manifest.runtime.database);
  const stateRoot = path.dirname(databaseFile);
  const vaultKey = process.env.MAHORAGA_CONTENT_VAULT_MASTER_KEY?.trim();
  const contentVault = await createContentVault({
    root: path.join(stateRoot, "content-vault"),
    keyFile: path.join(stateRoot, "content-vault.key.dpapi"),
    ...(vaultKey ? { masterKey: Buffer.from(vaultKey, "base64") } : {}),
  });
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
  console.error("Usage: node src/cli.mjs [start [--port 4783]|validate|status|submit <capability>]");
  process.exitCode = 2;
}

function createRelaySessionStateStore({ contentVault, referenceFile, deviceId }) {
  const expected = Object.freeze({ classification: "local-only", ownerType: "relay-session", ownerId: deviceId });
  return Object.freeze({
    async load() {
      const reference = await readRelaySessionReference(referenceFile);
      if (!reference) return null;
      return JSON.parse(contentVault.get(reference, expected).toString("utf8"));
    },
    async save(value) {
      const bytes = Buffer.from(JSON.stringify(value), "utf8");
      const reference = contentVault.put(bytes, expected);
      let previous = null;
      try { previous = await readRelaySessionReference(referenceFile); } catch { /* invalid stale pointer is replaced below */ }
      const temporary = `${referenceFile}.${process.pid}.tmp`;
      try {
        await writeFile(temporary, `${reference}\n`, { encoding: "utf8", mode: 0o600 });
        await rename(temporary, referenceFile);
      } catch (cause) {
        await rm(temporary, { force: true }).catch(() => {});
        try { contentVault.remove(reference, expected); } catch { /* orphan cleanup is best effort */ }
        throw cause;
      }
      if (previous && previous !== reference) {
        try { contentVault.remove(previous, expected); } catch { /* stale encrypted record expires under vault retention */ }
      }
    },
    async clear() {
      let reference = null;
      try { reference = await readRelaySessionReference(referenceFile); } catch { /* malformed pointer is deleted below */ }
      await rm(referenceFile, { force: true });
      if (reference) {
        try { contentVault.remove(reference, expected); } catch { /* missing or expired encrypted record is already unusable */ }
      }
    },
  });
}

async function readRelaySessionReference(referenceFile) {
  let value;
  try { value = (await readFile(referenceFile, "utf8")).trim(); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
  if (!/^vault:[a-f0-9-]{36}$/.test(value)) throw new TypeError("relay-runtime-session-reference-invalid");
  return value;
}
