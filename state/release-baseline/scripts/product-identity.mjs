import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadManifest } from "../src/config.mjs";
import { loadProductIdentity, assertProductIdentityMirrors } from "../src/product-identity.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relative) {
  return JSON.parse(await readFile(path.join(ROOT, relative), "utf8"));
}

export async function validateProductIdentitySurfaces() {
  const [identity, manifest, rootPackage, cloudPackage, onDiskManifest, cloudLock] = await Promise.all([
    loadProductIdentity(),
    loadManifest(),
    readJson("package.json"),
    readJson("cloud-app/package.json"),
    readJson("mahoraga.manifest.json"),
    readJson("cloud-app/package-lock.json"),
  ]);
  const mirrors = {
    rootPackage: rootPackage.version,
    manifest: manifest.version,
    onDiskManifest: onDiskManifest.version,
    cloudPackage: cloudPackage.version,
    cloudLock: cloudLock.version,
  };
  if (onDiskManifest.versions && typeof onDiskManifest.versions === "object") {
    mirrors.onDiskRuntime = onDiskManifest.versions.runtime;
    mirrors.onDiskControlCenter = onDiskManifest.versions.controlCenter;
    mirrors.onDiskApi = onDiskManifest.versions.api;
  }
  if (cloudLock.packages && cloudLock.packages[""] && typeof cloudLock.packages[""].version === "string") {
    mirrors.cloudLockPackage = cloudLock.packages[""].version;
  }
  const attested = assertProductIdentityMirrors(identity, mirrors);
  return Object.freeze({ ok: true, identity, mirrors: attested });
}

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "validate") throw new TypeError("Usage: node scripts/product-identity.mjs validate");
  const result = await validateProductIdentitySurfaces();
  console.log(`Product identity valid: ${result.identity.product} ${result.identity.version}`);
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invoked === import.meta.url) await main();
