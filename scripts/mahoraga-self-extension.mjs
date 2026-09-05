#!/usr/bin/env node
import path from "node:path";
import { readFile } from "node:fs/promises";
import { stdin as input, stdout, stderr } from "node:process";
import { loadManifest, ROOT } from "../src/config.mjs";
import { createContentVault } from "../src/content-vault.mjs";
import { LocalArtifactStore } from "../src/local-artifact-store.mjs";
import { executeArtifactAuthoringCapability } from "../src/artifact-authoring.mjs";
import { executeSelfExtensionCapability } from "../src/self-extension-worker.mjs";
import { assertAdditiveBaseline } from "../src/baseline-preservation.mjs";

const capability = process.argv[2];
const requestPath = process.argv[3];

if (!capability || !requestPath) {
  stderr.write("usage: node scripts/mahoraga-self-extension.mjs <capability> <request.json|->\n");
  process.exitCode = 2;
} else {
  try {
    const request = await readRequest(requestPath);
    const result = await execute(capability, request);
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    stderr.write(`${JSON.stringify({ verified: false, errorCode: classify(error) })}\n`);
    process.exitCode = 1;
  }
}

async function execute(name, request) {
  if (name === "baseline.check") return assertAdditiveBaseline(request);
  if (name === "artifact.create") {
    return executeArtifactAuthoringCapability(name, request, { store: await artifactStore() });
  }
  if (!new Set(["code.create-test", "self.patch", "agent.replicate", "self.enhance"]).has(name)) {
    throw Object.assign(new Error("unsupported-capability"), { code: "unsupported-capability" });
  }
  const manifest = await loadManifest();
  const primaryCodexBuilder = manifest.workers.find((worker) => worker.id === "primary-codex-builder" && worker.enabled);
  if (!primaryCodexBuilder) throw Object.assign(new Error("primary-codex-builder-unavailable"), { code: "primary-codex-builder-unavailable" });
  return executeSelfExtensionCapability(name, request, primaryCodexBuilder);
}

async function artifactStore() {
  const artifactRoot = process.env.MAHORAGA_ARTIFACT_ROOT ?? path.join(ROOT, "state", "artifacts");
  const stateRoot = path.dirname(artifactRoot);
  const contentVault = await createContentVault({
    root: process.env.MAHORAGA_CONTENT_VAULT_ROOT ?? path.join(stateRoot, "content-vault"),
    keyFile: process.env.MAHORAGA_CONTENT_VAULT_KEY_FILE ?? path.join(stateRoot, "content-vault.key.dpapi"),
  });
  return new LocalArtifactStore(artifactRoot, { contentVault });
}

async function readRequest(source) {
  const text = source === "-" ? await readStdin() : await readFile(path.resolve(process.cwd(), source), "utf8");
  const value = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Object.assign(new TypeError("self-extension-request-invalid"), { code: "self-extension-request-invalid" });
  return value;
}

async function readStdin() {
  let text = "";
  input.setEncoding("utf8");
  for await (const chunk of input) {
    text += chunk;
    if (Buffer.byteLength(text, "utf8") > 1024 * 1024) throw Object.assign(new Error("self-extension-request-too-large"), { code: "self-extension-request-too-large" });
  }
  return text;
}

function classify(error) {
  if (typeof error?.code === "string" && error.code.length <= 120) return error.code;
  if (typeof error?.message === "string" && /^[a-z0-9.-]{1,120}$/i.test(error.message)) return error.message;
  return "self-extension-failed";
}
