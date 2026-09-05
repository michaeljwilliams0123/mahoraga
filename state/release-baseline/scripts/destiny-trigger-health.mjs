import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateDestinyTriggerReadiness,
  summarizeDestinyTriggerHealth,
  validateDestinyTriggerTrustManifest,
} from "../src/destiny-trigger-trust.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = parseOptions(process.argv.slice(2));

try {
  const manifestPath = options.get("manifest") ?? path.join(ROOT, "config", "destiny-trigger-trust.json");
  const manifest = validateDestinyTriggerTrustManifest(JSON.parse(await readFile(path.resolve(manifestPath), "utf8")));
  const observation = options.has("observation")
    ? JSON.parse(await readFile(path.resolve(options.get("observation")), "utf8"))
    : null;
  const readiness = evaluateDestinyTriggerReadiness(manifest, observation, {
    now: options.get("now") ?? new Date().toISOString(),
  });
  console.log(JSON.stringify(summarizeDestinyTriggerHealth(manifest, readiness)));
  process.exitCode = readiness.ready ? 0 : 1;
} catch (error) {
  console.error(error?.message ?? String(error));
  process.exitCode = 2;
}

function parseOptions(tokens) {
  const parsed = new Map();
  for (let index = 0; index < tokens.length; index += 2) {
    const key = tokens[index];
    const value = tokens[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) throw new TypeError("destiny-trigger-command-options-invalid");
    const name = key.slice(2);
    if (!new Set(["manifest", "observation", "now"]).has(name) || parsed.has(name)) throw new TypeError("destiny-trigger-command-options-invalid");
    parsed.set(name, value);
  }
  return parsed;
}
