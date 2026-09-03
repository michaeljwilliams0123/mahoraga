import { createHash } from "node:crypto";
import path from "node:path";

const MANIFEST_KEYS = new Set(["schemaVersion", "id", "entrypoint", "allowedApis", "allowedPaths"]);
const LANGUAGES = new Set(["javascript", "python"]);
const FIXED_APIS = new Set(["repository.read", "repository.write", "artifact.read", "receipt.write"]);

export function inspectGeneratedExtension({ language, source, manifest, candidateRoot }) {
  if (!LANGUAGES.has(language)) fail("extension-language-invalid");
  if (typeof source !== "string" || Buffer.byteLength(source, "utf8") < 1 || Buffer.byteLength(source, "utf8") > 262_144 || source.includes("\0")) fail("extension-source-invalid");
  const declaration = validateExtensionManifest(manifest, language);
  if (typeof candidateRoot !== "string" || !path.isAbsolute(candidateRoot) || path.resolve(candidateRoot) !== candidateRoot) fail("candidate-root-invalid");
  const inspected = stripComments(source, language);
  const reasons = new Set();
  if (language === "javascript") inspectJavaScript(inspected, reasons);
  else inspectPython(inspected, reasons);
  inspectPaths(inspected, reasons);
  return Object.freeze({
    schemaVersion: 1,
    safe: reasons.size === 0,
    language,
    sourceSha256: sha256(source),
    sizeBytes: Buffer.byteLength(source, "utf8"),
    manifestSha256: sha256(JSON.stringify(declaration)),
    reasonCodes: [...reasons].sort(),
  });
}

function validateExtensionManifest(value, language) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== MANIFEST_KEYS.size || Object.keys(value).some((key) => !MANIFEST_KEYS.has(key))) fail("extension-manifest-invalid");
  if (value.schemaVersion !== 1 || typeof value.id !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(value.id)) fail("extension-manifest-invalid");
  relativePath(value.entrypoint, "extension-path-invalid");
  if ((language === "javascript" && !/\.(?:mjs|js)$/.test(value.entrypoint)) || (language === "python" && !value.entrypoint.endsWith(".py"))) fail("extension-entrypoint-invalid");
  if (!Array.isArray(value.allowedApis) || value.allowedApis.length < 1 || value.allowedApis.length > FIXED_APIS.size || new Set(value.allowedApis).size !== value.allowedApis.length || value.allowedApis.some((api) => !FIXED_APIS.has(api))) fail("extension-api-invalid");
  if (!Array.isArray(value.allowedPaths) || value.allowedPaths.length < 1 || value.allowedPaths.length > 32 || new Set(value.allowedPaths).size !== value.allowedPaths.length) fail("extension-path-invalid");
  value.allowedPaths.forEach((item) => relativePath(item, "extension-path-invalid"));
  return structuredClone(value);
}

function inspectJavaScript(source, reasons) {
  source = foldConstantStrings(source);
  if (/\beval\s*\(|\b(?:new\s+)?Function\s*\(|\bWebAssembly\.(?:compile|instantiate)\s*\(/.test(source)) reasons.add("dynamic-evaluation");
  if (/node:(?:child_process|cluster|worker_threads)|\b(?:child_process|Bun\.spawn|Deno\.Command|process\s*(?:\.|\[\s*["'])(?:spawn|exec|fork|kill)|globalThis\s*(?:\.|\[\s*["'])\s*process\b)/.test(source)) reasons.add("process-access");
  if (/node:(?:net|tls|dgram|http|https|http2)|\b(?:WebSocket|EventSource|fetch)\s*\(/.test(source)) reasons.add("network-access");
  if (/\bprocess\s*\.\s*env\b|\bprocess\s*\[\s*["']env["']\s*\]|\bDeno\s*\.\s*env\b|\bimport\.meta\.env\b|\bglobalThis\s*(?:\.|\[\s*["'])\s*process\b/.test(source)) reasons.add("environment-access");
  if (/node:fs|\brequire\s*\(\s*["']fs["']|\b__import__\b|\bglobalThis\s*(?:\.|\[\s*["'])\s*(?:require|module|process)\b/.test(source)) reasons.add("unrestricted-filesystem");
  if (/\b(?:require|import)\s*\(\s*(?!["'][^"']+["']\s*\))/.test(source)) reasons.add("dynamic-module-access");
}

function foldConstantStrings(source) {
  const literal = /(["'])([^"'\\]*)\1\s*\+\s*(["'])([^"'\\]*)\3/g;
  let prior;
  do { prior = source; source = source.replace(literal, (_match, _leftQuote, left, _rightQuote, right) => JSON.stringify(`${left}${right}`)); } while (source !== prior);
  return source;
}

function inspectPython(source, reasons) {
  if (/\b(?:eval|exec|compile)\s*\(/.test(source)) reasons.add("dynamic-evaluation");
  if (/\b(?:import|from)\s+(?:subprocess|multiprocessing|pty)\b|\bos\.(?:system|popen|spawn|exec|fork|kill)\b/.test(source)) reasons.add("process-access");
  if (/\b(?:import|from)\s+(?:socket|http|urllib|requests|aiohttp)\b/.test(source)) reasons.add("network-access");
  if (/\bos\.(?:environ|getenv|putenv)\b/.test(source)) reasons.add("environment-access");
}

function inspectPaths(source, reasons) {
  const strings = source.match(/["'`](?:\\.|[^"'`\\])*["'`]/g) ?? [];
  for (const literal of strings) {
    const value = literal.slice(1, -1);
    if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(value)) reasons.add("filesystem-traversal");
    if (/^(?:[a-zA-Z]:[\\/]|\/)(?!\/)/.test(value)) reasons.add("filesystem-outside-candidate");
  }
}

function relativePath(value, code) {
  if (typeof value !== "string" || value.length < 1 || value.length > 200 || value.startsWith("/") || value.includes("\\") || value.split("/").some((part) => part === "" || part === "." || part === "..")) fail(code);
}
function stripComments(source, language) { return language === "javascript" ? source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1") : source.replace(/#.*$/gm, ""); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function fail(code) { const error = new TypeError(code); error.code = code; throw error; }
