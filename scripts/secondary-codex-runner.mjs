import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";
import { SecondaryCodexRunner, validateSecondaryRunnerConfig } from "../src/secondary-codex-runner.mjs";

const CONFIG_FILE = path.join(ROOT, "state", "secondary-runner.json");
const [command = "help", ...tokens] = process.argv.slice(2);
const options = parseOptions(tokens);

if (command === "configure") await configure();
else if (command === "status") await status();
else if (command === "run-once") await runOnce();
else {
  console.log(`Usage:
  node scripts/secondary-codex-runner.mjs configure --task-area <slug> --repository <github-https-url> --checkout <absolute-path> --allowed-paths <csv> [--default-branch main] [--max-runtime-minutes 60] [--enabled true]
  node scripts/secondary-codex-runner.mjs status
  node scripts/secondary-codex-runner.mjs run-once`);
}

async function configure() {
  const current = await loadOptionalConfig();
  const project = {
    taskArea: required("task-area"),
    repository: required("repository"),
    checkout: path.resolve(required("checkout")),
    defaultBranch: options.get("default-branch") ?? "main",
    allowedPaths: csv(required("allowed-paths")),
    maxRuntimeMinutes: numberOption("max-runtime-minutes", 60),
    enabled: booleanOption("enabled", true),
  };
  const projects = (current?.projects ?? []).filter((item) => item.taskArea !== project.taskArea);
  projects.push(project);
  const config = validateSecondaryRunnerConfig({
    schemaVersion: 1,
    controlBranch: current?.controlBranch ?? "main",
    maxAttempts: current?.maxAttempts ?? 3,
    projects: projects.sort((left, right) => left.taskArea.localeCompare(right.taskArea)),
  });
  await atomicWrite(CONFIG_FILE, config);
  console.log(JSON.stringify({ configured: project.taskArea, repository: project.repository, enabled: project.enabled }, null, 2));
}

async function status() {
  console.log(JSON.stringify(await new SecondaryCodexRunner().status(), null, 2));
}

async function runOnce() {
  const result = await new SecondaryCodexRunner().runOnce();
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "failed" || result.status === "unavailable") process.exitCode = 1;
}

async function loadOptionalConfig() {
  try { return validateSecondaryRunnerConfig(JSON.parse(await readFile(CONFIG_FILE, "utf8"))); }
  catch (error) { if (error?.code === "ENOENT") return null; throw error; }
}

async function atomicWrite(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, file);
}

function parseOptions(values) {
  const result = new Map();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]; const value = values[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) throw new TypeError(`Invalid option near ${key ?? "end"}.`);
    const name = key.slice(2);
    if (result.has(name)) throw new TypeError(`Duplicate option: ${name}`);
    result.set(name, value);
  }
  return result;
}
function required(name) { const value = options.get(name); if (!value) throw new TypeError(`Missing required option: --${name}`); return value; }
function csv(value) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function numberOption(name, fallback) { const value = options.has(name) ? Number(options.get(name)) : fallback; if (!Number.isInteger(value)) throw new TypeError(`Option --${name} must be an integer.`); return value; }
function booleanOption(name, fallback) { if (!options.has(name)) return fallback; if (options.get(name) === "true") return true; if (options.get(name) === "false") return false; throw new TypeError(`Option --${name} must be true or false.`); }
