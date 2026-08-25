import { copyFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { ROOT, loadManifest } from "../src/config.mjs";
import { ESSENTIAL_FILES } from "../src/repair.mjs";

const refresh = process.argv.includes("--refresh");
const manifest = await loadManifest();
const baselineRoot = path.join(ROOT, manifest.repair.baselineDirectory);
for (const relative of ESSENTIAL_FILES) {
  const info = await stat(path.join(ROOT, relative)).catch(() => null);
  if (!info?.isFile() || info.size < 1) throw new Error(`Essential release file is missing or empty: ${relative}`);
}
let copied = 0;
for (const relative of ESSENTIAL_FILES) {
  const source = path.join(ROOT, relative);
  const target = path.join(baselineRoot, relative);
  if (!refresh && await exists(target)) continue;
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  copied += 1;
}
console.log(`Release baseline ready: ${copied} file(s) copied.`);

async function exists(file) { try { return (await stat(file)).isFile(); } catch { return false; } }

