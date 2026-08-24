import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";
import { createUpdateManifest, validateUpdateManifest } from "../src/update-contract.mjs";

const [command = "help", ...tokens] = process.argv.slice(2);
const options = parseOptions(tokens);

if (command === "create") {
  const artifact = insideRoot(required("artifact"));
  const bytes = await readFile(artifact);
  const details = await stat(artifact);
  const manifest = createUpdateManifest({
    version: required("version"), channel: required("channel"), tag: required("tag"),
    commit: required("commit"), artifactName: path.basename(artifact), sizeBytes: details.size,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  const output = insideRoot(required("output"));
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(JSON.stringify({ output: path.relative(ROOT, output).replaceAll("\\", "/"), version: manifest.version, channel: manifest.channel, sha256: manifest.artifact.sha256 }));
} else if (command === "validate") {
  const manifest = validateUpdateManifest(JSON.parse(await readFile(insideRoot(required("file")), "utf8")));
  console.log(JSON.stringify({ valid: true, version: manifest.version, channel: manifest.channel, commit: manifest.commit }));
} else {
  console.log("Usage: node scripts/update-manifest.mjs <create|validate> [options]");
}

function insideRoot(value) {
  const file = path.resolve(ROOT, value);
  const relative = path.relative(ROOT, file);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new TypeError("Update file must stay inside the repository.");
  return file;
}
function parseOptions(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]; const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) throw new TypeError(`Invalid option near ${key ?? "end"}.`);
    const name = key.slice(2); if (result.has(name)) throw new TypeError(`Duplicate option: ${name}`); result.set(name, value);
  }
  return result;
}
function required(name) { const value = options.get(name); if (!value) throw new TypeError(`Missing required option: --${name}`); return value; }
