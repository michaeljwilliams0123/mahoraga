import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const TABLE = "bots";
const SELECT = "botid,name,schemaname";
const OPTIONS = Object.freeze({ windowsHide: true, timeout: 30000, maxBuffer: 128 * 1024 });
const TARGETS = Object.freeze([
  Object.freeze({ alias: "enterprise-core", botId: "501917a0-9e8e-f111-8076-000d3a30cfe7", legacyName: "Mahorago Enterprise Core", targetName: "Mahoraga Enterprise Core" }),
  Object.freeze({ alias: "tenant-health-reader", botId: "3fed8376-1c8e-f111-8076-000d3a30cfe7", legacyName: "Mahorago Tenant Health Reader", targetName: "Mahoraga Tenant Health Reader" }),
]);
const TARGET_BY_ID = new Map(TARGETS.map((item) => [item.botId, item]));

export async function synchronizeCopilotStudioDisplayNames({ runDataverse = defaultRunDataverse, platform = process.platform } = {}) {
  if (platform !== "win32" && runDataverse === defaultRunDataverse) throw safeError("studio-display-name-windows-required");
  const agents = [];
  for (const target of TARGETS) {
    const before = await readBot(target, runDataverse);
    let changed = false;
    if (before.name === target.legacyName) {
      const payload = JSON.stringify({ name: target.targetName });
      const updated = parseRecord((await runDataverse("dataverse.cmd", updateArgs(target.botId, payload), OPTIONS))?.stdout);
      assertRecord(updated, target, before.schemaname, target.targetName);
      changed = true;
    }
    const after = await readBot(target, runDataverse);
    assertRecord(after, target, before.schemaname, target.targetName);
    agents.push(Object.freeze({ alias: target.alias, changed, displayName: target.targetName, schemaPreserved: true }));
  }
  return Object.freeze({ verified: true, agents: Object.freeze(agents) });
}

async function readBot(target, runDataverse) {
  const result = await runDataverse("dataverse.cmd", getArgs(target.botId), OPTIONS);
  const record = parseRecord(result?.stdout);
  if (![target.legacyName, target.targetName].includes(record?.name)) throw safeError("studio-display-name-record-invalid");
  if (!record?.schemaname || typeof record.schemaname !== "string") throw safeError("studio-display-name-record-invalid");
  if (String(record.botid ?? "").toLowerCase() !== target.botId) throw safeError("studio-display-name-record-invalid");
  return record;
}
function assertRecord(record, target, expectedSchema, expectedName) {
  if (!record || String(record.botid ?? "").toLowerCase() !== target.botId) throw safeError("studio-display-name-record-invalid");
  if (record.name !== expectedName || record.schemaname !== expectedSchema) throw safeError("studio-display-name-record-invalid");
}
function getArgs(botId) { return ["data", "get", "--table", TABLE, "--id", botId, "--select", SELECT, "--json"]; }
function updateArgs(botId, payload) { return ["data", "update", "--table", TABLE, "--id", botId, "--data", payload, "--return", "--json"]; }
async function defaultRunDataverse(command, args, options = {}) {
  if (command !== "dataverse.cmd" || !fixedOperation(args)) throw safeError("studio-display-name-operation-invalid");
  if (process.platform === "win32") return execFileAsync("cmd.exe", ["/d", "/s", "/c", "dataverse.cmd", ...args], { ...OPTIONS, ...options });
  return execFileAsync("dataverse", args, { ...OPTIONS, ...options });
}
function fixedOperation(args) {
  if (!Array.isArray(args) || args[0] !== "data" || !["get", "update"].includes(args[1])) return false;
  const idIndex = args.indexOf("--id");
  const id = idIndex >= 0 ? String(args[idIndex + 1] ?? "").toLowerCase() : "";
  if (!TARGET_BY_ID.has(id) || args[2] !== "--table" || args[3] !== TABLE) return false;
  if (args[1] === "get") return args.length === 9 && args[4] === "--id" && args[6] === "--select" && args[7] === SELECT && args[8] === "--json";
  if (args.length !== 10 || args[4] !== "--id" || args[6] !== "--data" || args[8] !== "--return" || args[9] !== "--json") return false;
  try {
    const payload = JSON.parse(args[7]);
    return payload && !Array.isArray(payload) && Object.keys(payload).length === 1 && payload.name === TARGET_BY_ID.get(id).targetName;
  } catch { return false; }
}
function parseRecord(stdout) {
  let parsed;
  try { parsed = JSON.parse(String(stdout ?? "")); } catch { throw safeError("studio-display-name-record-invalid"); }
  const record = parsed?.value && Array.isArray(parsed.value) ? parsed.value[0] : parsed?.result ?? parsed;
  if (!record || typeof record !== "object" || Array.isArray(record)) throw safeError("studio-display-name-record-invalid");
  return record;
}
function safeError(code) { return Object.assign(new Error(code), { code }); }
