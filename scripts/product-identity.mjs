import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest } from "../src/config.mjs";
import { loadProductIdentity, assertProductIdentityMirrors } from "../src/product-identity.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relative) {
  return JSON.parse(await readFile(path.join(ROOT, relative), "utf8"));
}

export async function validateProductIdentitySurfaces() {
  const [identity, manifest, rootPackage, cloudPackage] = await Promise.all([
    loadProductIdentity(),
    loadManifest(),
    readJson("package.json"),
    readJson("cloud-app/package.json"),
  ]);
  const mirrors = assertProductIdentityMirrors(identity, {
    rootPackage: rootPackage.version,
    manifest: manifest.version,
    cloudPackage: cloudPackage.version,
  });
  return Object.freeze({ ok: true, identity, mirrors });
}

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "validate") throw new TypeError("Usage: node scripts/product-identity.mjs validate");
  const result = await validateProductIdentitySurfaces();
  console.log(`Product identity valid: ${result.identity.product} ${result.identity.version}`);
}

const invoked = process.argv[1] ? pathToFileURLSafe(process.argv[1]) : null;
if (invoked === import.meta.url) await main();

function pathToFileURLSafe(value) {
  const absolute = path.resolve(value).replace(/\\/g, "/");
  return `file://${absolute.startsWith("/") ? "" : "/"}${absolute}`;
}
