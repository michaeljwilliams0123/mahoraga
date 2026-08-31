import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const VAULT_REFERENCE = /^vault:([a-f0-9-]{36})$/;
const CLASSIFICATIONS = new Set(["synthetic", "personal", "enterprise", "local-only"]);
const MAX_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const DEFAULT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;
const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));

export async function createContentVault({
  root,
  keyFile = root ? path.join(root, "..", "content-vault.key.dpapi") : null,
  keyHelperScript = path.join(MODULE_ROOT, "..", "scripts", "content-vault-key.ps1"),
  powershellExecutable = "powershell.exe",
  masterKey = null,
  now = () => new Date(),
  random = randomBytes,
  maximumBytes = DEFAULT_MAX_BYTES,
  defaultTtlMs = DEFAULT_TTL_MS,
} = {}) {
  const normalizedRoot = trustedVaultRoot(root);
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1024 || maximumBytes > DEFAULT_MAX_BYTES) throw vaultError("vault-limit-invalid");
  validateTtl(defaultTtlMs);
  mkdirSync(normalizedRoot, { recursive: true });
  const rootReal = realpathSync(normalizedRoot);
  const key = masterKey === null
    ? await loadProtectedMasterKey({ keyFile, keyHelperScript, powershellExecutable })
    : normalizeMasterKey(masterKey);
  return Object.freeze(new ContentVault({ root: rootReal, key, now, random, maximumBytes, defaultTtlMs }));
}

function trustedVaultRoot(value) {
  if (typeof value !== "string" || !path.isAbsolute(value) || path.resolve(value) !== value) throw vaultError("vault-root-invalid");
  return value;
}

export async function loadProtectedMasterKey({ keyFile, keyHelperScript, powershellExecutable = "powershell.exe" } = {}) {
  if (process.platform !== "win32") throw vaultError("vault-dpapi-windows-required");
  if (typeof keyFile !== "string" || !path.isAbsolute(keyFile) || typeof keyHelperScript !== "string" || !path.isAbsolute(keyHelperScript)) throw vaultError("vault-key-path-invalid");
  try {
    const result = await execFileAsync(powershellExecutable, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", keyHelperScript, "-Mode", "Ensure", "-Path", keyFile,
    ], { windowsHide: true, timeout: 30_000, maxBuffer: 4096 });
    return normalizeMasterKey(Buffer.from(String(result.stdout ?? "").trim(), "base64"));
  } catch (error) {
    const wrapped = vaultError("vault-dpapi-helper-failed");
    wrapped.cause = error;
    throw wrapped;
  }
}

class ContentVault {
  #key;

  constructor({ root, key, now, random, maximumBytes, defaultTtlMs }) {
    this.root = root;
    this.#key = key;
    this.now = now;
    this.random = random;
    this.maximumBytes = maximumBytes;
    this.defaultTtlMs = defaultTtlMs;
  }

  put(value, { classification, ownerType, ownerId, ttlMs = this.defaultTtlMs } = {}) {
    const bytes = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value ?? []);
    if (bytes.length < 1 || bytes.length > this.maximumBytes) throw vaultError(bytes.length < 1 ? "vault-content-empty" : "vault-content-too-large");
    const owner = normalizeOwner(ownerType, ownerId);
    const safeClassification = normalizeClassification(classification);
    validateTtl(ttlMs);
    const createdAt = normalizeNow(this.now());
    const expiresAt = new Date(Date.parse(createdAt) + ttlMs).toISOString();
    const reference = `vault:${randomUUID()}`;
    const metadata = Object.freeze({
      schemaVersion: 1,
      reference,
      classification: safeClassification,
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      createdAt,
      expiresAt,
    });
    const iv = normalizeRandom(this.random(12), 12, "vault-iv-invalid");
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    cipher.setAAD(Buffer.from(JSON.stringify(metadata), "utf8"));
    const ciphertext = Buffer.concat([cipher.update(bytes), cipher.final()]);
    const record = {
      metadata,
      algorithm: "aes-256-gcm",
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
    const target = this.#target(reference, true);
    writeFileSync(target, `${JSON.stringify(record)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    return reference;
  }

  get(reference, expected) {
    return this.#read(reference, expected).bytes;
  }

  metadata(reference, expected) {
    return this.#read(reference, expected).metadata;
  }

  remove(reference, expected) {
    this.#read(reference, expected);
    rmSync(this.#target(reference), { force: true });
    return true;
  }

  deleteExpired(at = this.now()) {
    const timestamp = Date.parse(normalizeNow(at));
    let deleted = 0;
    for (const prefix of safeDirectoryEntries(this.root).filter((entry) => entry.isDirectory() && /^[a-f0-9]{2}$/.test(entry.name))) {
      const directory = path.join(this.root, prefix.name);
      if (lstatSync(directory).isSymbolicLink()) continue;
      for (const entry of safeDirectoryEntries(directory).filter((item) => item.isFile() && /^[a-f0-9-]{36}\.vault$/.test(item.name))) {
        const reference = `vault:${entry.name.slice(0, -6)}`;
        try {
          const record = this.#record(reference);
          if (Date.parse(record.metadata.expiresAt) <= timestamp) {
            rmSync(this.#target(reference), { force: true });
            deleted += 1;
          }
        } catch {
          // Invalid or tampered records remain for explicit quarantine and investigation.
        }
      }
    }
    return deleted;
  }

  #read(reference, expected = {}) {
    const record = this.#record(reference);
    assertExpectedOwner(record.metadata, expected);
    if (Date.parse(record.metadata.expiresAt) <= Date.parse(normalizeNow(this.now()))) throw vaultError("vault-record-expired");
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.#key, Buffer.from(record.iv, "base64"));
      decipher.setAAD(Buffer.from(JSON.stringify(record.metadata), "utf8"));
      decipher.setAuthTag(Buffer.from(record.tag, "base64"));
      const bytes = Buffer.concat([decipher.update(Buffer.from(record.ciphertext, "base64")), decipher.final()]);
      if (bytes.length !== record.metadata.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== record.metadata.sha256) throw vaultError("vault-integrity-failed");
      return { metadata: Object.freeze({ ...record.metadata }), bytes };
    } catch (error) {
      if (error?.code?.startsWith?.("vault-")) throw error;
      throw vaultError("vault-authentication-failed");
    }
  }

  #record(reference) {
    const target = this.#target(reference);
    let value;
    try { value = JSON.parse(readFileSync(target, "utf8")); } catch (error) {
      if (error?.code === "ENOENT") throw vaultError("vault-record-missing");
      throw vaultError("vault-record-invalid");
    }
    validateRecord(value, reference, this.maximumBytes);
    return value;
  }

  #target(reference, createPrefix = false) {
    const id = vaultReference(reference);
    const directory = path.join(this.root, id.slice(0, 2));
    if (createPrefix) mkdirSync(directory, { recursive: true });
    else if (!existsSync(directory)) throw vaultError("vault-record-missing");
    assertSafeDirectory(this.root, directory);
    const target = path.join(directory, `${id}.vault`);
    if (!target.startsWith(`${this.root}${path.sep}`)) throw vaultError("vault-path-escape");
    return target;
  }
}

function validateRecord(value, reference, maximumBytes) {
  if (!isRecord(value) || !isRecord(value.metadata)) throw vaultError("vault-record-invalid");
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "algorithm,ciphertext,iv,metadata,tag" || value.algorithm !== "aes-256-gcm") throw vaultError("vault-record-invalid");
  const metadata = value.metadata;
  const metadataKeys = Object.keys(metadata).sort().join(",");
  if (metadataKeys !== "classification,createdAt,expiresAt,ownerId,ownerType,reference,schemaVersion,sha256,sizeBytes") throw vaultError("vault-record-invalid");
  if (metadata.schemaVersion !== 1 || metadata.reference !== reference) throw vaultError("vault-record-invalid");
  normalizeClassification(metadata.classification); normalizeOwner(metadata.ownerType, metadata.ownerId);
  if (!Number.isSafeInteger(metadata.sizeBytes) || metadata.sizeBytes < 1 || metadata.sizeBytes > maximumBytes || !/^[a-f0-9]{64}$/.test(metadata.sha256)) throw vaultError("vault-record-invalid");
  if (!Number.isFinite(Date.parse(metadata.createdAt)) || !Number.isFinite(Date.parse(metadata.expiresAt)) || Date.parse(metadata.expiresAt) <= Date.parse(metadata.createdAt)) throw vaultError("vault-record-invalid");
  if (!isBase64Bytes(value.iv, 12) || !isBase64Bytes(value.tag, 16) || typeof value.ciphertext !== "string" || Buffer.from(value.ciphertext, "base64").length !== metadata.sizeBytes) throw vaultError("vault-record-invalid");
}

function assertExpectedOwner(metadata, expected) {
  const owner = normalizeOwner(expected?.ownerType, expected?.ownerId);
  if (owner.ownerType !== metadata.ownerType || owner.ownerId !== metadata.ownerId) throw vaultError("vault-owner-mismatch");
  if (expected.classification !== undefined && normalizeClassification(expected.classification) !== metadata.classification) throw vaultError("vault-classification-mismatch");
}

function assertSafeDirectory(root, directory) {
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw vaultError("vault-path-escape");
  if (lstatSync(resolved).isSymbolicLink() || realpathSync(resolved) !== resolved) throw vaultError("vault-path-escape");
}

function safeDirectoryEntries(directory) {
  try { return readdirSync(directory, { withFileTypes: true }); } catch { return []; }
}

function normalizeMasterKey(value) {
  const key = Buffer.isBuffer(value) ? Buffer.from(value) : Buffer.from(value ?? []);
  if (key.length !== 32) throw vaultError("vault-master-key-invalid");
  return key;
}
function normalizeRandom(value, length, code) { const bytes = Buffer.from(value ?? []); if (bytes.length !== length) throw vaultError(code); return bytes; }
function normalizeClassification(value) { if (!CLASSIFICATIONS.has(value)) throw vaultError("vault-classification-invalid"); return value; }
function normalizeOwner(ownerType, ownerId) {
  if (typeof ownerType !== "string" || !/^[a-z][a-z0-9-]{0,31}$/.test(ownerType) || typeof ownerId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9-]{0,119}$/.test(ownerId)) throw vaultError("vault-owner-invalid");
  return { ownerType, ownerId };
}
function validateTtl(value) { if (!Number.isSafeInteger(value) || value < 1_000 || value > MAX_TTL_MS) throw vaultError("vault-ttl-invalid"); }
function normalizeNow(value) { const date = value instanceof Date ? value : new Date(value); if (!Number.isFinite(date.getTime())) throw vaultError("vault-clock-invalid"); return date.toISOString(); }
function vaultReference(value) { const match = typeof value === "string" ? value.match(VAULT_REFERENCE) : null; if (!match) throw vaultError("vault-reference-invalid"); return match[1]; }
function isBase64Bytes(value, length) { if (typeof value !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false; return Buffer.from(value, "base64").length === length; }
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function vaultError(code) { const error = new Error(code); error.code = code; return error; }
