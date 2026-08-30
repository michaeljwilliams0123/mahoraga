import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";
import { createSelfUpgradeValidationReceipt, validateSelfUpgradeInstruction } from "../src/self-upgrade-instruction.mjs";

const [command, ...args] = process.argv.slice(2);
if (command !== "validate") {
  console.error("Usage: node scripts/self-upgrade-instruction.mjs validate [--file <repository-relative profile.json>]");
  process.exitCode = 2;
} else {
  try {
    const file = await profilePath(args);
    const instruction = validateSelfUpgradeInstruction(JSON.parse(await readFile(file, "utf8")));
    console.log(JSON.stringify(createSelfUpgradeValidationReceipt(instruction)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

async function profilePath(args) {
  const relative = option(args, "--file") ?? "coordination/zero-credit/self-upgrade-v1.json";
  if (path.posix.isAbsolute(relative) || path.win32.isAbsolute(relative) || relative.includes("\\") || relative.split("/").includes("..") || !relative.startsWith("coordination/zero-credit/") || path.posix.normalize(relative) !== relative) {
    throw new TypeError("Self-upgrade profile path must be a normalized repository-relative file under coordination/zero-credit.");
  }
  const ownedRoot = path.resolve(ROOT, "coordination", "zero-credit");
  const candidate = path.resolve(ROOT, relative);
  if (!candidate.startsWith(`${ownedRoot}${path.sep}`)) throw new TypeError("Self-upgrade profile path is outside the owned policy directory.");
  const resolved = await realpath(candidate);
  if (!resolved.startsWith(`${ownedRoot}${path.sep}`)) throw new TypeError("Self-upgrade profile path escapes the owned policy directory.");
  return resolved;
}

function option(args, name) {
  if (args.length === 0) return null;
  if (args.length !== 2 || args[0] !== name || !args[1]) throw new TypeError("Only --file <repository-relative profile.json> is accepted.");
  return args[1];
}