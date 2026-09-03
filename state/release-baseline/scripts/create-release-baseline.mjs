import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, loadManifest } from "../src/config.mjs";
import { ESSENTIAL_FILES } from "../src/repair.mjs";

export async function verifyBaselineFiles({ root, baselineRoot, files }) {
  const findings = [];
  for (const relative of files) {
    const source = path.join(root, relative);
    const target = path.join(baselineRoot, relative);
    const sourceInfo = await stat(source).catch(() => null);
    if (!sourceInfo?.isFile() || sourceInfo.size < 1) {
      findings.push({ relative, reason: "source-missing-or-empty" });
      continue;
    }
    const targetInfo = await stat(target).catch(() => null);
    if (!targetInfo?.isFile() || targetInfo.size < 1) {
      findings.push({ relative, reason: "baseline-missing-or-empty" });
      continue;
    }
    const [sourceBytes, targetBytes] = await Promise.all([readFile(source), readFile(target)]);
    if (!sourceBytes.equals(targetBytes)) findings.push({ relative, reason: "content-drift" });
  }
  return findings;
}

export async function prepareReleaseBaseline({ root = ROOT, manifest, refresh = false, verify = false, files = ESSENTIAL_FILES } = {}) {
  if (refresh && verify) throw new Error("Choose either --refresh or --verify, not both.");
  const resolvedManifest = manifest ?? await loadManifest();
  const baselineRoot = path.join(root, resolvedManifest.repair.baselineDirectory);

  for (const relative of files) {
    const info = await stat(path.join(root, relative)).catch(() => null);
    if (!info?.isFile() || info.size < 1) throw new Error(`Essential release file is missing or empty: ${relative}`);
  }

  if (verify) {
    const findings = await verifyBaselineFiles({ root, baselineRoot, files });
    return { mode: "verify", baselineRoot, findings, copied: 0 };
  }

  let copied = 0;
  for (const relative of files) {
    const source = path.join(root, relative);
    const target = path.join(baselineRoot, relative);
    if (!refresh && await exists(target)) continue;
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
    copied += 1;
  }
  return { mode: refresh ? "refresh" : "prepare", baselineRoot, findings: [], copied };
}

async function runCli() {
  const refresh = process.argv.includes("--refresh");
  const verify = process.argv.includes("--verify");
  const result = await prepareReleaseBaseline({ refresh, verify });
  if (verify) {
    if (result.findings.length > 0) {
      for (const finding of result.findings) console.error(`Release baseline drift: ${finding.relative} (${finding.reason})`);
      process.exitCode = 1;
      return;
    }
    console.log(`Release baseline verified: ${ESSENTIAL_FILES.length} file(s) match.`);
    return;
  }
  console.log(`Release baseline ready: ${result.copied} file(s) copied.`);
}

async function exists(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) await runCli();
