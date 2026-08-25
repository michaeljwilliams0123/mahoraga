import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const MAX_LOCAL_ARTIFACT_BYTES = 25 * 1024 * 1024;
const ARTIFACT_ID = /^art-[a-f0-9-]{36,}$/;
const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".jsonl", ".xml", ".yaml", ".yml",
  ".log", ".ini", ".cfg", ".conf", ".sql", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
  ".css", ".html", ".htm", ".py", ".ps1", ".sh", ".bat", ".cmd", ".java", ".cs", ".go", ".rs",
]);

export class LocalArtifactStore {
  constructor(root, { maximumBytes = MAX_LOCAL_ARTIFACT_BYTES } = {}) {
    if (typeof root !== "string" || !path.isAbsolute(root)) throw new TypeError("artifact-root-invalid");
    if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1024 || maximumBytes > 100 * 1024 * 1024) throw new TypeError("artifact-limit-invalid");
    this.root = root;
    this.maximumBytes = maximumBytes;
  }

  async put({ name, mimeType = "application/octet-stream", source = "picker", bytes }) {
    const safeName = artifactName(name);
    const safeMimeType = artifactMimeType(mimeType);
    if (!new Set(["picker", "clipboard", "drop", "api", "test"]).has(source)) throw new TypeError("artifact-source-invalid");
    if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes ?? []);
    if (bytes.length < 1) throw new TypeError("artifact-empty");
    if (bytes.length > this.maximumBytes) throw new TypeError("artifact-too-large");
    const id = `art-${randomUUID()}`;
    const directory = this.#directory(id);
    const createdAt = new Date().toISOString();
    const metadata = Object.freeze({
      id,
      name: safeName,
      mimeType: safeMimeType,
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      source,
      createdAt,
      storageClass: "device-local-private",
    });
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, "payload"), bytes, { flag: "wx" });
    await writeFile(path.join(directory, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    return metadata;
  }

  async get(id) {
    artifactId(id);
    const metadata = JSON.parse(await readFile(path.join(this.#directory(id), "metadata.json"), "utf8"));
    return validateStoredMetadata(metadata, id, this.maximumBytes);
  }

  async read(id) {
    const metadata = await this.get(id);
    const bytes = await readFile(path.join(this.#directory(id), "payload"));
    if (bytes.length !== metadata.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== metadata.sha256) throw new Error("artifact-integrity-failed");
    return { metadata, bytes };
  }

  async resolve(ids) {
    if (!Array.isArray(ids) || ids.length > 20 || new Set(ids).size !== ids.length) throw new TypeError("artifact-references-invalid");
    return Promise.all(ids.map((id) => this.get(id)));
  }

  async remove(id) {
    artifactId(id);
    await rm(this.#directory(id), { recursive: true, force: true });
  }

  #directory(id) { return path.join(this.root, id); }
}

export async function inspectTaskArtifacts(task, { store }) {
  if (!(store instanceof LocalArtifactStore)) throw new TypeError("artifact-store-required");
  const references = [];
  for (const message of task?.messages ?? []) {
    for (const attachment of message.attachments ?? []) if (!references.some((item) => item.id === attachment.id)) references.push(attachment);
  }
  if (references.length === 0) return { verified: true, summary: "No local attachments were supplied for inspection.", artifactCount: 0 };
  const observations = [];
  for (const reference of references.slice(0, 20)) observations.push(await inspectOne(store, reference.id));
  const summary = `Inspected ${observations.length} private local attachment${observations.length === 1 ? "" : "s"}. ${observations.map((item) => item.summary).join(" ")}`.slice(0, 1950);
  return { verified: true, summary, artifactCount: observations.length, observations };
}

async function inspectOne(store, id) {
  const { metadata, bytes } = await store.read(id);
  const extension = path.extname(metadata.name).toLowerCase();
  if (metadata.mimeType.startsWith("text/") || TEXT_EXTENSIONS.has(extension)) {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    const normalized = text.replace(/\u0000/g, "").replace(/\s+/g, " ").trim();
    const words = normalized ? normalized.split(/\s+/).length : 0;
    const preview = normalized.slice(0, 700);
    return {
      id, name: metadata.name, mimeType: metadata.mimeType, sizeBytes: metadata.sizeBytes, sha256: metadata.sha256,
      kind: "text", characters: text.length, words,
      summary: `${metadata.name}: readable text, ${words} words. ${preview ? `Preview: ${preview}` : "The file is empty after text normalization."}`,
    };
  }
  const dimensions = imageDimensions(metadata.mimeType, bytes);
  if (metadata.mimeType.startsWith("image/")) {
    return {
      id, name: metadata.name, mimeType: metadata.mimeType, sizeBytes: metadata.sizeBytes, sha256: metadata.sha256,
      kind: "image", ...dimensions,
      summary: `${metadata.name}: private image${dimensions.width ? `, ${dimensions.width}×${dimensions.height}` : ""}, ${formatBytes(metadata.sizeBytes)}. It is ready for an image-capable local or approved provider; deterministic inspection does not invent visual content.`,
    };
  }
  const structured = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".vsd", ".vsdx", ".zip", ".eml", ".msg"]).has(extension);
  return {
    id, name: metadata.name, mimeType: metadata.mimeType, sizeBytes: metadata.sizeBytes, sha256: metadata.sha256,
    kind: structured ? "structured-document" : "binary",
    summary: `${metadata.name}: ${structured ? "structured document" : "binary file"}, ${formatBytes(metadata.sizeBytes)}. The original is retained locally and is ready for a compatible document or application provider.`,
  };
}

function imageDimensions(mimeType, bytes) {
  if (mimeType === "image/png" && bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  return { width: null, height: null };
}

function validateStoredMetadata(value, expectedId, maximumBytes) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.id !== expectedId) throw new TypeError("artifact-metadata-invalid");
  artifactId(value.id); artifactName(value.name); artifactMimeType(value.mimeType);
  if (!Number.isSafeInteger(value.sizeBytes) || value.sizeBytes < 1 || value.sizeBytes > maximumBytes) throw new TypeError("artifact-size-invalid");
  if (!/^[a-f0-9]{64}$/.test(value.sha256)) throw new TypeError("artifact-hash-invalid");
  if (value.storageClass !== "device-local-private" || !Number.isFinite(Date.parse(value.createdAt))) throw new TypeError("artifact-metadata-invalid");
  return Object.freeze({ ...value });
}

function artifactId(value) { if (typeof value !== "string" || !ARTIFACT_ID.test(value)) throw new TypeError("artifact-id-invalid"); return value; }
function artifactName(value) {
  if (typeof value !== "string") throw new TypeError("artifact-name-invalid");
  const safe = path.basename(value.replace(/[\u0000-\u001f]/g, "").trim());
  if (!safe || safe.length > 200 || safe === "." || safe === "..") throw new TypeError("artifact-name-invalid");
  return safe;
}
function artifactMimeType(value) { if (typeof value !== "string" || value.length < 1 || value.length > 120 || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(value)) throw new TypeError("artifact-mime-invalid"); return value.toLowerCase(); }
function formatBytes(bytes) { if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`; return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
