import { randomUUID } from "node:crypto";
import { lstat, open, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./config.mjs";

export const DEFAULT_ENTERPRISE_MAXIMUM_BYTES = 100 * 1024 * 1024;
export const DEFAULT_ENTERPRISE_EXTENSIONS = Object.freeze([
  ".csv", ".docx", ".json", ".md", ".pdf", ".pptx", ".tsv", ".txt", ".xlsx", ".xml", ".yaml", ".yml",
]);

const ROOT_LIMIT = 16;
const LABEL_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._()-]{0,79}$/u;

export async function createEnterpriseWorkspace({
  roots,
  repositoryRoot = ROOT,
  maximumBytes = DEFAULT_ENTERPRISE_MAXIMUM_BYTES,
  allowedExtensions = DEFAULT_ENTERPRISE_EXTENSIONS,
} = {}) {
  if (!Array.isArray(roots) || roots.length < 1 || roots.length > ROOT_LIMIT) {
    throw new TypeError("Enterprise workspace roots must contain between 1 and 16 operator-approved directories.");
  }
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > DEFAULT_ENTERPRISE_MAXIMUM_BYTES) {
    throw new TypeError("Enterprise workspace maximum file size is invalid.");
  }

  const repository = await canonicalDirectory(repositoryRoot, "repository root");
  const extensions = normalizeExtensions(allowedExtensions);
  const approvedRoots = new Map();

  for (const entry of roots) {
    if (!isRecord(entry) || typeof entry.path !== "string" || !path.isAbsolute(entry.path)) {
      throw new TypeError("Enterprise workspace roots require an absolute operator-approved path.");
    }
    if (typeof entry.label !== "string" || !LABEL_PATTERN.test(entry.label)) {
      throw new TypeError("Enterprise workspace root label is invalid.");
    }
    const configured = path.resolve(entry.path);
    const configuredInfo = await lstat(configured);
    if (configuredInfo.isSymbolicLink()) throw new TypeError("Enterprise workspace root cannot be a symbolic link.");
    const canonical = await canonicalDirectory(configured, "enterprise workspace root");
    if (pathsOverlap(canonical, repository)) {
      throw new TypeError("Enterprise workspace root cannot overlap the Mahoraga repository.");
    }
    if ([...approvedRoots.values()].some((root) => pathsOverlap(root.canonicalPath, canonical))) {
      throw new TypeError("Enterprise workspace roots cannot overlap each other.");
    }
    const id = `ewr-${randomUUID()}`;
    approvedRoots.set(id, Object.freeze({ id, label: entry.label, canonicalPath: canonical }));
  }

  return new EnterpriseWorkspace({ approvedRoots, extensions, maximumBytes });
}

class EnterpriseWorkspace {
  #roots;
  #extensions;
  #maximumBytes;
  #assets = new Map();

  constructor({ approvedRoots, extensions, maximumBytes }) {
    this.#roots = approvedRoots;
    this.#extensions = extensions;
    this.#maximumBytes = maximumBytes;
  }

  listRoots() {
    return [...this.#roots.values()].map(({ id, label }) => Object.freeze({ id, label }));
  }

  async registerAsset({ rootId, relativePath }) {
    const root = this.#roots.get(rootId);
    if (!root) throw new TypeError("Enterprise workspace root is not approved.");
    const asset = await inspectAsset(root, relativePath, this.#extensions, this.#maximumBytes);
    const id = `ewa-${randomUUID()}`;
    this.#assets.set(id, Object.freeze({
      id,
      rootId,
      relativePath: asset.relativePath,
      size: asset.size,
      modifiedMs: asset.modifiedMs,
    }));
    return publicAsset(id, rootId, asset);
  }

  getAsset(assetId) {
    const asset = this.#assets.get(assetId);
    if (!asset) return null;
    return Object.freeze({ id: asset.id, rootId: asset.rootId, registered: true });
  }

  forgetAsset(assetId) {
    return this.#assets.delete(assetId);
  }

  async openAsset(assetId) {
    const registered = this.#assets.get(assetId);
    if (!registered) throw new TypeError("Enterprise workspace asset is not registered.");
    const root = this.#roots.get(registered.rootId);
    const inspected = await inspectAsset(root, registered.relativePath, this.#extensions, this.#maximumBytes);
    const handle = await open(inspected.canonicalPath, "r");
    try {
      const current = await handle.stat();
      if (!current.isFile() || current.size > this.#maximumBytes) throw new TypeError("Enterprise workspace asset is no longer safe to read.");
      return {
        handle,
        metadata: Object.freeze({
          id: assetId,
          rootId: registered.rootId,
          size: current.size,
          modifiedAt: current.mtime.toISOString(),
          extension: inspected.extension,
        }),
      };
    } catch (error) {
      await handle.close();
      throw error;
    }
  }
}

async function inspectAsset(root, relativePath, extensions, maximumBytes) {
  if (typeof relativePath !== "string" || relativePath.length < 1 || relativePath.length > 1024 || path.isAbsolute(relativePath) || relativePath.includes("\0")) {
    throw new TypeError("Enterprise workspace asset path is invalid.");
  }
  const normalized = path.normalize(relativePath);
  const segments = normalized.split(/[\\/]+/);
  if (normalized === "." || segments.some((segment) => segment === "" || segment === "." || segment === ".." || unsafePathSegment(segment))) {
    throw new TypeError("Enterprise workspace asset traversal is not allowed.");
  }

  let candidate = root.canonicalPath;
  for (const segment of segments) {
    candidate = path.join(candidate, segment);
    const info = await lstat(candidate);
    if (info.isSymbolicLink()) throw new TypeError("Enterprise workspace asset cannot traverse a symbolic link.");
  }

  const canonicalPath = await realpath(candidate);
  if (!isWithin(root.canonicalPath, canonicalPath)) throw new TypeError("Enterprise workspace asset escaped its approved root.");
  const info = await stat(canonicalPath);
  if (!info.isFile()) throw new TypeError("Enterprise workspace asset must be a regular file.");
  if (info.size > maximumBytes) throw new TypeError("Enterprise workspace asset exceeds the approved size limit.");
  const extension = path.extname(canonicalPath).toLowerCase();
  if (!extensions.has(extension)) throw new TypeError("Enterprise workspace asset type is not approved.");
  return {
    canonicalPath,
    relativePath: segments.join(path.sep),
    displayName: path.basename(canonicalPath),
    extension,
    size: info.size,
    modifiedMs: info.mtimeMs,
    modifiedAt: info.mtime.toISOString(),
  };
}

function unsafePathSegment(segment) {
  if (/[<>:"|?*\u0000-\u001f]/u.test(segment) || /[. ]$/u.test(segment)) return true;
  const stem = segment.split(".", 1)[0].toUpperCase();
  return /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/u.test(stem);
}

function publicAsset(id, rootId, asset) {
  return Object.freeze({
    id,
    rootId,
    displayName: asset.displayName,
    extension: asset.extension,
    size: asset.size,
    modifiedAt: asset.modifiedAt,
  });
}

async function canonicalDirectory(value, label) {
  if (typeof value !== "string" || !path.isAbsolute(value)) throw new TypeError(`${label} must be an absolute path.`);
  const canonical = await realpath(value);
  const info = await stat(canonical);
  if (!info.isDirectory()) throw new TypeError(`${label} must be a directory.`);
  return path.resolve(canonical);
}

function normalizeExtensions(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) throw new TypeError("Enterprise workspace extension allowlist is invalid.");
  const extensions = new Set();
  for (const item of value) {
    if (typeof item !== "string" || !/^\.[a-z0-9]{1,10}$/i.test(item)) throw new TypeError("Enterprise workspace extension is invalid.");
    extensions.add(item.toLowerCase());
  }
  return extensions;
}

function pathsOverlap(left, right) {
  return isWithin(left, right) || isWithin(right, left);
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
