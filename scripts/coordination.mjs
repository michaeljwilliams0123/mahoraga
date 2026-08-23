import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "../src/config.mjs";
import { createAssignmentRecord, createResultRecord, validateAssignmentRecord, validateResultRecord } from "../src/coordination-records.mjs";

const ASSIGNMENTS = path.join(ROOT, "coordination", "assignments");
const RESULTS = path.join(ROOT, "coordination", "results");
const [command = "help", ...tokens] = process.argv.slice(2);
const options = parseOptions(tokens);

if (command === "create-assignment") await createAssignment();
else if (command === "complete-assignment") await completeAssignment();
else if (command === "validate") await validateMailbox();
else if (command === "list") await listMailbox();
else {
  console.log(`Usage:
  node scripts/coordination.mjs create-assignment --title <text> --task-area <slug> --task <text> --allowed-paths <csv> [--base-commit <sha>]
  node scripts/coordination.mjs complete-assignment --id <sec-id> --status <completed|blocked> --summary <text> [--return-commit <sha>] [--changed-files <csv>] [--verification <csv>]
  node scripts/coordination.mjs validate
  node scripts/coordination.mjs list`);
}

async function createAssignment() {
  const record = createAssignmentRecord({
    title: required("title"),
    taskArea: required("task-area"),
    expectedTask: required("task"),
    expectedBaseCommit: options.get("base-commit") ?? gitHead(),
    allowedPaths: csv(required("allowed-paths")),
    correlationId: options.get("correlation-id"),
    createdBy: options.get("created-by") ?? "main-codex",
    assignedTo: options.get("assigned-to") ?? "secondary-codex",
  }, options.has("id") ? { assignmentId: options.get("id") } : undefined);
  await mkdir(ASSIGNMENTS, { recursive: true });
  const file = path.join(ASSIGNMENTS, `${record.assignmentId}.json`);
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(JSON.stringify({ created: path.relative(ROOT, file), assignmentId: record.assignmentId, returnBranch: record.returnBranch }, null, 2));
}

async function completeAssignment() {
  const id = required("id");
  const assignment = validateAssignmentRecord(JSON.parse(await readFile(path.join(ASSIGNMENTS, `${id}.json`), "utf8")));
  const status = options.get("status") ?? "completed";
  const record = createResultRecord(assignment, {
    status,
    completedBy: options.get("completed-by") ?? "secondary-codex",
    returnCommit: options.get("return-commit") ?? (status === "completed" ? gitHead() : null),
    changedFiles: csv(options.get("changed-files") ?? ""),
    verification: csv(options.get("verification") ?? ""),
    summary: required("summary"),
  });
  await mkdir(RESULTS, { recursive: true });
  const file = path.join(RESULTS, `${record.assignmentId}.json`);
  await writeFile(file, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(JSON.stringify({ created: path.relative(ROOT, file), assignmentId: record.assignmentId, status: record.status }, null, 2));
}

async function validateMailbox() {
  const assignments = new Map();
  for (const file of await jsonFiles(ASSIGNMENTS)) {
    const record = validateAssignmentRecord(JSON.parse(await readFile(file, "utf8")));
    if (assignments.has(record.assignmentId)) throw new Error(`Duplicate assignment ID: ${record.assignmentId}`);
    assignments.set(record.assignmentId, record);
  }
  let resultCount = 0;
  for (const file of await jsonFiles(RESULTS)) {
    const source = JSON.parse(await readFile(file, "utf8"));
    const assignment = assignments.get(source.assignmentId);
    if (!assignment) throw new Error(`Result has no assignment: ${source.assignmentId}`);
    validateResultRecord(source, assignment);
    resultCount += 1;
  }
  console.log(`Coordination mailbox valid: ${assignments.size} assignment(s), ${resultCount} result(s).`);
}

async function listMailbox() {
  const results = new Set((await jsonFiles(RESULTS)).map((file) => path.basename(file, ".json")));
  const rows = [];
  for (const file of await jsonFiles(ASSIGNMENTS)) {
    const record = validateAssignmentRecord(JSON.parse(await readFile(file, "utf8")));
    rows.push({ assignmentId: record.assignmentId, title: record.title, taskArea: record.taskArea, state: results.has(record.assignmentId) ? "returned" : "ready", returnBranch: record.returnBranch });
  }
  console.log(JSON.stringify(rows, null, 2));
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
function csv(value) { return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : []; }
function gitHead() {
  try { return execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(); }
  catch { throw new Error("Unable to resolve Git HEAD; provide --base-commit or --return-commit explicitly."); }
}
async function jsonFiles(directory) {
  try { return (await readdir(directory, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => path.join(directory, entry.name)).sort(); }
  catch (error) { if (error?.code === "ENOENT") return []; throw error; }
}
