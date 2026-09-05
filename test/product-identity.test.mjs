import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadProductIdentity, assertProductIdentityMirrors } from "../src/product-identity.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET_VERSION = "7.0.0-alpha.2";

async function json(relative) {
  return JSON.parse(await readFile(path.join(ROOT, relative), "utf8"));
}

test("root, manifest, cloud app, and lockfile share one Mahoraga product version", async () => {
  const [identity, rootPackage, manifest, cloudPackage, cloudLock] = await Promise.all([
    loadProductIdentity(),
    json("package.json"),
    json("mahoraga.manifest.json"),
    json("cloud-app/package.json"),
    json("cloud-app/package-lock.json"),
  ]);

  assert.deepEqual(identity, {
    schemaVersion: 1,
    product: "Mahoraga",
    version: TARGET_VERSION,
  });

  const mirrors = {
    rootPackage: rootPackage.version,
    manifest: manifest.version,
    cloudPackage: cloudPackage.version,
    cloudLock: cloudLock.version,
    cloudLockRoot: cloudLock.packages?.[""]?.version,
  };
  assert.deepEqual(Object.values(mirrors), Array(Object.keys(mirrors).length).fill(TARGET_VERSION));
  assert.deepEqual(assertProductIdentityMirrors(identity, mirrors), mirrors);
});

test("product identity validation fails closed when any visible surface diverges", async () => {
  const identity = await loadProductIdentity();
  assert.throws(() => assertProductIdentityMirrors(identity, {
    rootPackage: identity.version,
    manifest: identity.version,
    cloudPackage: "1.0.0",
    cloudLock: identity.version,
    cloudLockRoot: identity.version,
  }), /product-version-divergence/);
});
