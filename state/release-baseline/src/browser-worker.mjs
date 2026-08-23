import { spawn } from "node:child_process";
import path from "node:path";
import { ROOT } from "./config.mjs";
import { cdpRequest, observeLoopbackControlCenter } from "./browser-cdp.mjs";

const CDP_HOST = "127.0.0.1";
const CDP_PORT = 9223;
const CDP_BASE = `http://${CDP_HOST}:${CDP_PORT}`;
const CONTROL_CENTER = "http://127.0.0.1:4782/";
const DEFAULT_CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PROFILE = path.join(ROOT, "state", "browser-profile");
const ARTIFACTS = path.join(ROOT, "state", "browser-artifacts");
const ARTIFACT_RETENTION_MS = 24 * 60 * 60 * 1000;
let chromeProcess;

export async function executeBrowserCapability(capability, task = {}) {
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
  if (capability === "browser.observe") {
    return observeLoopbackControlCenter({
      cdpBase: CDP_BASE,
      controlCenterUrl: CONTROL_CENTER,
      artifactDirectory: ARTIFACTS,
      taskId: task.id ?? "browser-observe",
      retentionMs: ARTIFACT_RETENTION_MS,
    });
  }
  throw new Error("unsupported-capability");
}

export function shutdownBrowser() {
  if (chromeProcess && !chromeProcess.killed) chromeProcess.kill();
  chromeProcess = undefined;
}

export async function ensureChrome({ request = cdpJson, launch = spawn, mkdirProfile } = {}) {
  if (chromeProcess && !chromeProcess.killed) {
    try { await request("/json/version"); return; } catch { chromeProcess = undefined; }
  }
  try {
    await request("/json/version");
    throw new Error("browser-cdp-unowned");
  } catch (error) {
    if (error?.message === "browser-cdp-unowned") throw error;
  }
  const ensureProfile = mkdirProfile ?? ((profile) => import("node:fs/promises").then(({ mkdir }) => mkdir(profile, { recursive: true })));
  await ensureProfile(PROFILE);
  const executable = process.env.MAHORAGA_CHROME_PATH || DEFAULT_CHROME;
  chromeProcess = launch(executable, [
    "--headless=new",
    `--remote-debugging-address=${CDP_HOST}`,
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${PROFILE}`,
    "--no-first-run",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "about:blank",
  ], { stdio: "ignore", windowsHide: true });
  chromeProcess.once?.("exit", () => { chromeProcess = undefined; });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try { await request("/json/version"); return; } catch { await delay(250); }
  }
  throw new Error("browser-start-timeout");
}

async function cdpJson(route, init) {
  return cdpRequest(CDP_BASE, route, init);
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
