import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  buildDestinyCodexBinding,
  createSignedReceiptTrustFromBinding,
  findCodexCloudTaskByTitle,
} from "../src/codex-connection-identity.mjs";
import { fingerprintPublicKeySpki } from "../src/destiny-trigger-trust.mjs";

const options = parseOptions(process.argv.slice(2));
const expectedTitle = required("expected-title");
const codexHome = path.resolve(options.get("codex-home") ?? process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"));
const stateDir = path.resolve(options.get("state-dir") ?? path.join(os.homedir(), ".mahoraga", "destiny-codex"));

const authPath = path.join(codexHome, "auth.json");
const installationPath = path.join(codexHome, "installation_id");
const auth = JSON.parse(await readFile(authPath, "utf8"));
if (String(auth.auth_mode ?? "").toLowerCase() === "apikey" || typeof auth.OPENAI_API_KEY === "string") {
  throw new Error("destiny-codex-chatgpt-auth-required");
}
const accountId = auth.tokens?.account_id;
if (typeof accountId !== "string" || accountId.trim().length < 1) throw new Error("destiny-codex-account-id-unavailable");
const installationId = (await readFile(installationPath, "utf8")).trim();
if (!installationId) throw new Error("destiny-codex-installation-id-unavailable");

const key = await ensureReceiptKey(stateDir);
const cloudPayload = options.has("cloud-list-file")
  ? JSON.parse(await readFile(path.resolve(options.get("cloud-list-file")), "utf8"))
  : readCloudTasks();
const task = findCodexCloudTaskByTitle(cloudPayload, expectedTitle);
const binding = buildDestinyCodexBinding({
  accountId,
  installationId,
  task,
  receiptKeyFingerprint: key.fingerprint,
});
const receiptTrust = createSignedReceiptTrustFromBinding(binding);

await mkdir(stateDir, { recursive: true });
const bindingPath = path.join(stateDir, "binding.json");
const trustPath = path.join(stateDir, "trust-snippet.json");
await writeFile(bindingPath, `${JSON.stringify(binding, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
await writeFile(trustPath, `${JSON.stringify(receiptTrust, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

console.log(JSON.stringify({
  ready: true,
  expectedTaskTitle: expectedTitle,
  codexCloudTaskId: binding.codexCloudTaskId,
  codexTaskReference: binding.codexTaskReference,
  codexAccountFingerprint: binding.codexAccountFingerprint,
  codexInstallationFingerprint: binding.codexInstallationFingerprint,
  codexEnvironmentFingerprint: binding.codexEnvironmentFingerprint,
  receiptKeyFingerprint: binding.receiptKeyFingerprint,
  bindingPath,
  trustPath,
}));

function readCloudTasks() {
  const executable = process.env.CODEX_BIN ?? "codex";
  let stdout;
  try {
    stdout = execFileSync(executable, ["cloud", "list", "--json", "--limit", "100"], {
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    const detail = typeof error?.stderr === "string" ? error.stderr.trim() : "";
    throw new Error(detail ? `destiny-codex-cloud-list-failed:${detail}` : "destiny-codex-cloud-list-failed");
  }
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error("destiny-codex-cloud-list-json-invalid");
  }
}

async function ensureReceiptKey(directory) {
  await mkdir(directory, { recursive: true });
  const privateKeyPath = path.join(directory, "receipt-private-key.pem");
  const publicKeyPath = path.join(directory, "receipt-public-key.pem");
  const privateExists = await isFile(privateKeyPath);
  const publicExists = await isFile(publicKeyPath);
  if (privateExists !== publicExists) throw new Error("destiny-codex-receipt-keypair-incomplete");

  let publicKeySpki;
  if (privateExists) {
    publicKeySpki = await readFile(publicKeyPath, "utf8");
  } else {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });
    publicKeySpki = publicKey.export({ type: "spki", format: "pem" });
    await writeFile(privateKeyPath, privateKeyPem, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await writeFile(publicKeyPath, publicKeySpki, { encoding: "utf8", mode: 0o644, flag: "wx" });
  }
  return Object.freeze({ publicKeyPath, privateKeyPath, fingerprint: fingerprintPublicKeySpki(publicKeySpki) });
}

function parseOptions(tokens) {
  const result = new Map();
  for (let index = 0; index < tokens.length; index += 2) {
    const flag = tokens[index];
    const value = tokens[index + 1];
    if (!flag?.startsWith("--") || value == null || value.startsWith("--")) throw new TypeError("destiny-codex-bootstrap-options-invalid");
    const name = flag.slice(2);
    if (result.has(name)) throw new TypeError("destiny-codex-bootstrap-option-duplicate");
    result.set(name, value);
  }
  return result;
}
function required(name) { const value = options.get(name); if (!value) throw new TypeError(`Missing --${name}`); return value; }
async function isFile(file) { try { return (await stat(file)).isFile(); } catch { return false; } }
