import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const VERSION = process.env.npm_package_version || JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).version;
const REQUIRED = Object.freeze([
  ["cloudflare-worker.mjs", ["relay/cloudflare-worker.mjs", "cloud/relay/cloudflare-worker.mjs", "src/relay/cloudflare-worker.mjs"]],
  ["core.mjs", ["relay/core.mjs", "cloud/relay/core.mjs", "src/relay/core.mjs"]],
  ["wrangler.toml", ["relay/wrangler.toml", "cloud/relay/wrangler.toml", "src/relay/wrangler.toml"]],
]);

export function packageDestinyRelay({ root = ROOT, version = VERSION, outDir = path.join(root, "dist") } = {}) {
  const entries = REQUIRED.map(([name, candidates]) => {
    const found = candidates.map((candidate) => path.join(root, candidate)).find((candidate) => fs.existsSync(candidate));
    if (!found) throw Object.assign(new Error(`relay-packaging-missing-${name}`), { code: `relay-packaging-missing-${name}` });
    return { name: `mahoraga-relay-${version}/${name}`, data: fs.readFileSync(found) };
  });
  fs.mkdirSync(outDir, { recursive: true });
  const zipPath = path.join(outDir, `mahoraga-relay-${version}.zip`);
  fs.writeFileSync(zipPath, createZip(entries));
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(zipPath)).digest("hex");
  const manifest = { artifact: path.relative(root, zipPath), sha256, bytes: fs.statSync(zipPath).size, entries: entries.map((entry) => entry.name), deploy: "blocked-packaging-only" };
  fs.writeFileSync(`${zipPath}.attestation.json`, JSON.stringify(manifest, null, 2));
  return Object.freeze(manifest);
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const data = Buffer.from(entry.data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8); local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8); central.writeUInt16LE(0, 10); central.writeUInt32LE(0, 12); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(central.length, 12); eocd.writeUInt32LE(offset, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, central, eocd]);
}
function crc32(data) { let crc = ~0; for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return ~crc >>> 0; }
if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(packageDestinyRelay(), null, 2));
