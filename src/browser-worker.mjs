import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./config.mjs";

const CDP_HOST = "127.0.0.1";
const CDP_PORT = 9223;
const CDP_BASE = `http://${CDP_HOST}:${CDP_PORT}`;
const CONTROL_CENTER = "http://127.0.0.1:4782/";
const DEFAULT_CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
let chromeProcess;

export async function executeBrowserCapability(capability) {
  await ensureChrome();
  if (capability === "browser.status") {
    const version = await cdpJson("/json/version");
    const targets = await cdpJson("/json/list");
    return {
      verified: true,
      summary: `Dedicated loopback Chrome is healthy with ${targets.length} target(s).`,
      browser: version.Browser,
      endpoint: `${CDP_HOST}:${CDP_PORT}`,
      targets: targets.length,
    };
  }
  if (capability === "browser.smoke") {
    const target = await cdpJson(`/json/new?${encodeURIComponent(CONTROL_CENTER)}`, { method: "PUT" });
    const deadline = Date.now() + 15000;
    let observed;
    while (Date.now() < deadline) {
      const targets = await cdpJson("/json/list");
      observed = targets.find((item) => item.id === target.id);
      if (observed?.title === "Mahoraga Control Center") break;
      await delay(250);
    }
    await fetch(`${CDP_BASE}/json/close/${target.id}`).catch(() => undefined);
    if (observed?.title !== "Mahoraga Control Center") throw new Error("browser-verification-failed");
    return {
      verified: true,
      summary: "Browser Worker opened the loopback Control Center and verified its rendered title.",
      url: CONTROL_CENTER,
      title: observed.title,
    };
  }
  throw new Error("unsupported-capability");
}

export function shutdownBrowser() {
  if (chromeProcess && !chromeProcess.killed) chromeProcess.kill();
  chromeProcess = undefined;
}

async function ensureChrome() {
  try {
    await cdpJson("/json/version");
    return;
  } catch {}
  const profile = path.join(ROOT, "state", "browser-profile");
  await mkdir(profile, { recursive: true });
  const executable = process.env.MAHORAGA_CHROME_PATH || DEFAULT_CHROME;
  chromeProcess = spawn(executable, [
    "--headless=new",
    `--remote-debugging-address=${CDP_HOST}`,
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "about:blank",
  ], { stdio: "ignore", windowsHide: true });
  chromeProcess.once("exit", () => { chromeProcess = undefined; });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try { await cdpJson("/json/version"); return; } catch { await delay(250); }
  }
  throw new Error("browser-start-timeout");
}

async function cdpJson(route, init) {
  const response = await fetch(`${CDP_BASE}${route}`, { ...init, signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error(`browser-cdp-${response.status}`);
  return response.json();
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
