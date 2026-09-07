import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildDestinyCodexBinding,
  createSignedReceiptTrustFromBinding,
  findCodexCloudTaskByProbeId,
} from "../src/codex-connection-identity.mjs";
import { signDestinyTriggerEvidence } from "../src/destiny-trigger-signing.mjs";
import { fingerprintPublicKeySpki } from "../src/destiny-trigger-trust.mjs";

const TRIGGER_ID = "destiny-event-dispatch-v1";
const REPOSITORY = "michaeljwilliams0123/mahoraga";
const options = parseOptions(process.argv.slice(2));
const probeId = required("probe-id");
const codexHome = path.resolve(options.get("codex-home") ?? process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"));
const stateDir = path.resolve(options.get("state-dir") ?? path.join(os.homedir(), ".mahoraga", "destiny-codex"));

const auth = JSON.parse(await readFile(path.join(codexHome, "auth.json"), "utf8"));
if (String(auth.auth_mode ?? "").toLowerCase() === "apikey" || typeof auth.OPENAI_API_KEY === "string") throw new Error("destiny-codex-chatgpt-auth-required");
const accountId = auth.tokens?.account_id;
if (typeof accountId !== "string" || accountId.trim().length < 1) throw new Error("destiny-codex-account-id-unavailable");
const installationId = (await readFile(path.join(codexHome, "installation_id"), "utf8")).trim();
if (!installationId) throw new Error("destiny-codex-installation-id-unavailable");

const key = await ensureReceiptKey(stateDir);
const cloudPayload = options.has("cloud-list-file") ? JSON.parse(await readFile(path.resolve(options.get("cloud-list-file")), "utf8")) : readCloudTasks();
const task = findCodexCloudTaskByProbeId(cloudPayload, probeId);
const observedAt = new Date().toISOString();
const binding = buildDestinyCodexBinding({ accountId, installationId, task, receiptKeyFingerprint: key.fingerprint, observedAt });
const receiptTrust = createSignedReceiptTrustFromBinding(binding, { keyId: TRIGGER_ID });
const readiness = signDestinyTriggerEvidence({
  schemaVersion: 1, triggerId: TRIGGER_ID, repository: REPOSITORY, status: "ready", observedAt,
  zeroCreditEligible: true, probeId, codexCloudTaskId: binding.codexCloudTaskId,
  codexTaskReference: binding.codexTaskReference, codexAccountFingerprint: binding.codexAccountFingerprint,
  codexInstallationFingerprint: binding.codexInstallationFingerprint, codexEnvironmentFingerprint: binding.codexEnvironmentFingerprint,
}, { privateKeyPkcs8: key.privateKeyPkcs8, publicKeySpki: key.publicKeySpki, keyId: TRIGGER_ID });
const privateRoute = {
  schemaVersion: 2, kind: "destiny-codex-private-route", repository: REPOSITORY,
  environmentId: task.environmentId, codexAccountFingerprint: binding.codexAccountFingerprint,
  codexEnvironmentFingerprint: binding.codexEnvironmentFingerprint,
  receiptKeyFingerprint: binding.receiptKeyFingerprint, boundAt: observedAt,
};

await mkdir(stateDir, { recursive: true });
await writeJson(path.join(stateDir, "binding.json"), binding);
await writeJson(path.join(stateDir, "trust-snippet.json"), receiptTrust);
await writeJson(path.join(stateDir, "readiness.json"), readiness);
await writeJson(path.join(stateDir, "route-private.json"), privateRoute);
console.log(JSON.stringify({
  ready: true, probeId, codexCloudTaskId: binding.codexCloudTaskId, codexTaskReference: binding.codexTaskReference,
  codexAccountFingerprint: binding.codexAccountFingerprint, codexInstallationFingerprint: binding.codexInstallationFingerprint,
  codexEnvironmentFingerprint: binding.codexEnvironmentFingerprint, receiptKeyFingerprint: binding.receiptKeyFingerprint,
  files: ["binding.json", "trust-snippet.json", "readiness.json", "receipt-public-key.pem"],
}));

function readCloudTasks() {
  const executable = process.env.CODEX_BIN ?? "codex";
  let stdout;
  try {
    stdout = execFileSync(executable, ["cloud", "list", "--json", "--limit", "20"], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 4 * 1024 * 1024 });
  } catch { throw new Error("destiny-codex-cloud-list-failed"); }
  try { return JSON.parse(stdout); } catch { throw new Error("destiny-codex-cloud-list-json-invalid"); }
}
async function ensureReceiptKey(directory) {
  await mkdir(directory, { recursive: true });
  const privateKeyPath = path.join(directory, "receipt-private-key.pem");
  const publicKeyPath = path.join(directory, "receipt-public-key.pem");
  const privateExists = await isFile(privateKeyPath); const publicExists = await isFile(publicKeyPath);
  if (privateExists !== publicExists) throw new Error("destiny-codex-receipt-keypair-incomplete");
  let privateKeyPkcs8; let publicKeySpki;
  if (privateExists) { privateKeyPkcs8 = await readFile(privateKeyPath, "utf8"); publicKeySpki = await readFile(publicKeyPath, "utf8"); }
  else {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    privateKeyPkcs8 = privateKey.export({ type: "pkcs8", format: "pem" }); publicKeySpki = publicKey.export({ type: "spki", format: "pem" });
    await writeFile(privateKeyPath, privateKeyPkcs8, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await writeFile(publicKeyPath, publicKeySpki, { encoding: "utf8", mode: 0o644, flag: "wx" });
  }
  return Object.freeze({ privateKeyPkcs8, publicKeySpki, fingerprint: fingerprintPublicKeySpki(publicKeySpki) });
}
async function writeJson(file, value) { await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 }); }
function parseOptions(tokens) {
  const result = new Map();
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index]; const value = tokens[index + 1];
    if (!flag?.startsWith("--") || value == null || value.startsWith("--")) throw new TypeError("destiny-codex-bootstrap-options-invalid");
    const name = flag.slice(2); if (result.has(name)) throw new TypeError("destiny-codex-bootstrap-option-duplicate"); result.set(name, value);
  }
  return result;
}
function required(name) { const value = options.get(name); if (!value) throw new TypeError(`Missing --${name}`); return value; }
async function isFile(file) { try { return (await stat(file)).isFile(); } catch { return false; } }
