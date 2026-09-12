import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const stateRoot = "/var/lib/mahoraga";
const receiptFile = path.join(stateRoot, "idle-receipts.ndjson");
const children = new Map();
const restartHistory = new Map();
let stopping = false;
let idleTimer = null;
mkdirSync(stateRoot, { recursive: true });

const shared = { ...process.env,
  MAHORAGA_STATE_DIR: stateRoot,
  MAHORAGA_DATABASE_FILE: path.join(stateRoot, "mahoraga.sqlite"),
  MAHORAGA_ARTIFACT_ROOT: path.join(stateRoot, "artifacts"),
  MAHORAGA_CONTENT_VAULT_ROOT: path.join(stateRoot, "content-vault"),
  MAHORAGA_CORE_URL: "http://127.0.0.1:4782",
  HOSTNAME: "0.0.0.0", PORT: "3000",
};

start("core", process.execPath, ["src/cli.mjs", "start"]);
await waitReady("http://127.0.0.1:4782/api/status", 30_000);
start("workspace", npmCommand(), ["--prefix", "cloud-app", "run", "start", "--", "-H", "0.0.0.0", "-p", shared.PORT]);

idleTimer = setInterval(async () => {
  const receipt = { schemaVersion: 1, type: "idle-liveness", observedAt: new Date().toISOString(), modelInvocations: 0, core: false, workspace: false };
  try { receipt.core = (await fetch("http://127.0.0.1:4782/api/status", { signal: AbortSignal.timeout(4_000) })).ok; } catch {}
  try { receipt.workspace = (await fetch("http://127.0.0.1:3000/api/live", { signal: AbortSignal.timeout(4_000) })).ok; } catch {}
  rotateAndAppend(receipt);
}, 30_000);
idleTimer.unref();

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => void shutdown(signal));

function start(name, command, args) {
  if (stopping) return;
  const child = spawn(command, args, { cwd: root, env: shared, stdio: "inherit", windowsHide: true });
  children.set(name, child);
  child.once("exit", (code) => {
    children.delete(name);
    if (stopping) return;
    const now = Date.now();
    const history = (restartHistory.get(name) || []).filter((value) => now - value < 10 * 60_000);
    if (history.length >= 8) { rotateAndAppend({ schemaVersion: 1, type: "supervisor-circuit-open", process: name, observedAt: new Date().toISOString(), modelInvocations: 0, exitCode: code }); process.exitCode = 1; void shutdown("circuit-open"); return; }
    history.push(now); restartHistory.set(name, history);
    const cap = Math.min(30_000, 500 * (2 ** (history.length - 1)));
    const delay = Math.floor(Math.random() * (cap + 1));
    rotateAndAppend({ schemaVersion: 1, type: "process-restart-scheduled", process: name, observedAt: new Date().toISOString(), modelInvocations: 0, exitCode: code, delayMs: delay, attempt: history.length });
    setTimeout(() => start(name, command, args), delay).unref();
  });
}
async function shutdown(reason) { if (stopping) return; stopping = true; if (idleTimer) clearInterval(idleTimer); for (const child of children.values()) child.kill("SIGTERM"); await Promise.all([...children.values()].map((child) => new Promise((resolve) => child.once("exit", resolve)))); rotateAndAppend({ schemaVersion: 1, type: "supervisor-stopped", reason, observedAt: new Date().toISOString(), modelInvocations: 0 }); }
async function waitReady(url, timeoutMs) { const end = Date.now() + timeoutMs; while (Date.now() < end) { try { if ((await fetch(url, { signal: AbortSignal.timeout(1_000) })).ok) return; } catch {} await new Promise((resolve) => setTimeout(resolve, 250)); } throw new Error("cloud-core-readiness-timeout"); }
function rotateAndAppend(value) { if (existsSync(receiptFile) && statSync(receiptFile).size > 1024 * 1024) renameSync(receiptFile, `${receiptFile}.previous`); appendFileSync(receiptFile, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600 }); }
function npmCommand() { return process.platform === "win32" ? "npm.cmd" : "npm"; }