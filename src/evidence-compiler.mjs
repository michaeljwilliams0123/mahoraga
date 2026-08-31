import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";

const DEFAULT_LIMITS = Object.freeze({ maximumFiles: 500, maximumFileBytes: 262_144, maximumTotalBytes: 2_097_152, includeContentBytes: 65_536 });
const SUSPICIOUS_PATH = /(?:^|\/)(?:\.env(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)|credentials?|secrets?|tokens?|.*\.(?:pem|p12|pfx|key))(?:$|\/)/i;
const SECRET_CONTENT = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b/;

export async function compileEvidencePack({ root, selectedPaths, revision, limits = DEFAULT_LIMITS }) {
  if (typeof root !== "string" || !path.isAbsolute(root)) fail("evidence-root-invalid");
  if (!Array.isArray(selectedPaths) || selectedPaths.length < 1 || selectedPaths.length > 500) fail("evidence-selection-invalid");
  if (typeof revision !== "string" || !/^[a-f0-9]{40,64}$/i.test(revision)) fail("evidence-revision-invalid");
  const bounded = validateLimits({ ...DEFAULT_LIMITS, ...limits });
  const confinedRoot = await realpath(root);
  const candidates = [];
  for (const selected of selectedPaths) {
    validateRelative(selected);
    await collect(confinedRoot, selected, candidates);
  }
  const unique = [...new Set(candidates)].sort();
  if (unique.length > bounded.maximumFiles) fail("evidence-file-limit");
  const files = [];
  const excluded = [];
  let totalBytes = 0;
  for (const relative of unique) {
    if (SUSPICIOUS_PATH.test(relative)) { excluded.push({ path: relative, reasonCode: "suspicious-path" }); continue; }
    const absolute = path.join(confinedRoot, relative);
    const resolved = await realpath(absolute);
    ensureConfined(confinedRoot, resolved);
    const stat = await lstat(resolved);
    if (!stat.isFile()) { excluded.push({ path: relative, reasonCode: "unsupported-type" }); continue; }
    if (stat.size > bounded.maximumFileBytes) { excluded.push({ path: relative, reasonCode: "oversized" }); continue; }
    const source = await readFile(resolved);
    if (source.includes(0)) { excluded.push({ path: relative, reasonCode: "binary" }); continue; }
    const content = source.toString("utf8");
    if (SECRET_CONTENT.test(content)) { excluded.push({ path: relative, reasonCode: "secret-content" }); continue; }
    if (totalBytes + source.byteLength > bounded.maximumTotalBytes) { excluded.push({ path: relative, reasonCode: "total-limit" }); continue; }
    totalBytes += source.byteLength;
    const entry = {
      path: relative,
      sha256: digest(source),
      sizeBytes: source.byteLength,
      lineStart: 1,
      lineEnd: content.length === 0 ? 0 : content.split("\n").length - (content.endsWith("\n") ? 1 : 0),
    };
    if (source.byteLength <= bounded.includeContentBytes) entry.content = content;
    files.push(entry);
  }
  const structure = { schemaVersion: 1, revision: revision.toLowerCase(), files: files.map(({ content: _content, ...item }) => item), excluded };
  return deepFreeze({
    schemaVersion: 1,
    revision: revision.toLowerCase(),
    structuralDigest: digest(Buffer.from(JSON.stringify(structure))),
    files,
    excluded,
    totals: { includedFiles: files.length, excludedFiles: excluded.length, includedBytes: totalBytes },
  });
}

async function collect(root, relative, output) {
  const resolved = await realpath(path.join(root, relative));
  ensureConfined(root, resolved);
  const stat = await lstat(resolved);
  if (stat.isFile()) { output.push(toPortable(relative)); return; }
  if (!stat.isDirectory()) { output.push(toPortable(relative)); return; }
  for (const entry of (await readdir(resolved, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const child = toPortable(path.join(relative, entry.name));
    await collect(root, child, output);
  }
}
function validateLimits(value) {
  for (const [key, min, max] of [["maximumFiles", 1, 10_000], ["maximumFileBytes", 1, 4_194_304], ["maximumTotalBytes", 1, 67_108_864], ["includeContentBytes", 0, 1_048_576]]) {
    if (!Number.isInteger(value[key]) || value[key] < min || value[key] > max) fail("evidence-limits-invalid");
  }
  if (value.includeContentBytes > value.maximumFileBytes) fail("evidence-limits-invalid");
  return value;
}
function validateRelative(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 240 || path.isAbsolute(value) || value.includes("\\") || value.includes("\0")) fail("evidence-path-invalid");
  const parts = value.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) fail("evidence-path-invalid");
}
function ensureConfined(root, target) { const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`; if (target !== root && !target.startsWith(prefix)) fail("evidence-path-escape"); }
function toPortable(value) { return value.split(path.sep).join("/"); }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child); } return value; }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
