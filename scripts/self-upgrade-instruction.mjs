import { readFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";
import { createSelfUpgradeValidationReceipt, validateSelfUpgradeInstruction } from "../src/self-upgrade-instruction.mjs";

const [command, ...args] = process.argv.slice(2);
if (command !== "validate") {
  console.error("Usage: node scripts/self-upgrade-instruction.mjs validate [--file <profile.json>]");
  process.exitCode = 2;
} else {
  try {
    const file = option(args, "--file") ?? path.join(ROOT, "coordination", "zero-credit", "self-upgrade-v1.json");
    const instruction = validateSelfUpgradeInstruction(JSON.parse(await readFile(file, "utf8")));
    console.log(JSON.stringify(createSelfUpgradeValidationReceipt(instruction)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1] || args[index + 2]) return index < 0 ? null : (() => { throw new TypeError(`Missing or extra ${name} value.`); })();
  return path.resolve(args[index + 1]);
}