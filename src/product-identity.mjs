import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PRODUCT_IDENTITY_PATH = path.join(ROOT, "config", "product-identity.json");
const IDENTITY_KEYS = new Set(["schemaVersion", "product", "version"]);
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]{1,30})?$/;

export async function loadProductIdentity(file = PRODUCT_IDENTITY_PATH) {
  return validateProductIdentity(JSON.parse(await readFile(file, "utf8")));
}

export function validateProductIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("product-identity-invalid");
  const keys = Object.keys(value);
  if (keys.length !== IDENTITY_KEYS.size || keys.some((key) => !IDENTITY_KEYS.has(key))) throw new TypeError("product-identity-fields-invalid");
  if (value.schemaVersion !== 1 || value.product !== "Mahoraga") throw new TypeError("product-identity-invalid");
  if (typeof value.version !== "string" || value.version.length > 40 || !VERSION_PATTERN.test(value.version)) throw new TypeError("product-version-invalid");
  return Object.freeze({ schemaVersion: 1, product: value.product, version: value.version });
}

export function assertProductIdentityMirrors(identity, mirrors) {
  const canonical = validateProductIdentity(identity);
  if (!mirrors || typeof mirrors !== "object" || Array.isArray(mirrors) || Object.keys(mirrors).length < 1) throw new TypeError("product-mirrors-invalid");
  const normalized = {};
  for (const [surface, version] of Object.entries(mirrors)) {
    if (typeof surface !== "string" || !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/.test(surface) || typeof version !== "string") throw new TypeError("product-mirrors-invalid");
    if (version !== canonical.version) throw new TypeError(`product-version-divergence:${surface}`);
    normalized[surface] = version;
  }
  return Object.freeze(normalized);
}
