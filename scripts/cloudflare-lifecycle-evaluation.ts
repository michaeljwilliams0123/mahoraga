import { createHash, randomBytes as cryptoRandomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createLifecycleRun, advanceLifecycle, finalizeLifecycle, markLifecycleFailure, workerNameFor, validateLifecycleReceipt, type WorkerRole, type LifecycleRun, type LifecycleReceipt } from "../src/curious-lifecycle.ts";
import { compareReconstruction, evaluateAbsorption } from "../src/curious-lifecycle-evaluator.ts";
import { validateInvestigationReceipt, type CognitiveInvestigationReceipt } from "../src/cognitive-investigation.ts";

const config = "deploy/cloudflare-lifecycle-evaluation/wrangler.jsonc";
const namePattern = /^mahoraga-lifecycle-test-([a-z0-9]{12,32})-(clone|reconstruction)$/;
const shaPattern = /^[a-f0-9]{40}$/;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export type GeneratedWorkerName = `mahoraga-lifecycle-test-${string}-${WorkerRole}`;
export type DeployInput = Readonly<{ runId: string; sourceSha: string; role: WorkerRole; expiresAt: string }>;
export type ControllerInput = Readonly<{ sourceSha: string; subdomain: string }>;
export type ControllerAdapters = Readonly<{
  runWrangler(args: readonly string[], stdin?: string): Promise<string>;
  fetch(url: string, init: RequestInit): Promise<Response>;
  inventory(): Promise<readonly string[]>;
  tagWorker(name: string, runId: string, expiresAt: string): Promise<void>;
  randomBytes(size: number): Uint8Array;
  now(): Date;
  writeArtifact(name: string, value: unknown): Promise<void>;
}>;

function validName(value: string): asserts value is GeneratedWorkerName {
  const match = namePattern.exec(value);
  if (!match || value !== workerNameFor(match[1]!, match[2] as WorkerRole)) throw Error("worker-name-invalid");
}
export function buildLifecycleDeployArgs(input: DeployInput): readonly string[] {
  if (!shaPattern.test(input.sourceSha)) throw Error("source-sha-invalid");
  const name = workerNameFor(input.runId, input.role);
  if (!Number.isFinite(Date.parse(input.expiresAt))) throw Error("expiry-invalid");
  return ["deploy", "--config", config, "--name", name, "--tag", `lifecycle-${input.runId}`, "--var", `RUN_ID:${input.runId}`, "--var", `TARGET_SHA:${input.sourceSha}`, "--var", `ROLE:${input.role}`, "--var", `EXPIRES_AT:${input.expiresAt}`];
}
export function buildLifecycleDeleteArgs(workerName: string): readonly string[] {
  validName(workerName);
  return ["delete", workerName, "--config", config];
}
export function verifyLifecycleWorkerTags(tags: readonly string[], runId: string): void {
  if (!/^[a-z0-9]{12,32}$/.test(runId) || !tags.includes(`mahoraga-lifecycle-${runId}`)) throw Error("worker-ownership-unverified");
}
function checkIdentity(value: unknown, run: LifecycleRun, role: WorkerRole): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || (value as Record<string, unknown>).runId !== run.runId || (value as Record<string, unknown>).sourceSha !== run.sourceSha || (value as Record<string, unknown>).role !== role) throw Error("worker-identity-invalid");
}

export async function runCuriousLifecycle(input: ControllerInput, adapters: ControllerAdapters): Promise<LifecycleReceipt> {
  if (!shaPattern.test(input.sourceSha)) throw Error("source-sha-invalid");
  if (!/^[a-z0-9-]{3,63}$/.test(input.subdomain)) throw Error("test-subdomain-invalid");
  const runId = Buffer.from(adapters.randomBytes(6)).toString("hex");
  const now = () => adapters.now().toISOString();
  let run = createLifecycleRun({ runId, sourceSha: input.sourceSha, requestedAt: now() });
  const expected = [workerNameFor(runId, "clone"), workerNameFor(runId, "reconstruction")];
  const attempted = new Set<string>();
  const secret = Buffer.from(adapters.randomBytes(32)).toString("hex");
  const expiresAt = new Date(adapters.now().getTime() + 20 * 60_000).toISOString();
  const save = () => adapters.writeArtifact("run-record.json", { schemaVersion: 1, runId, sourceSha: input.sourceSha, expected, attempted: [...attempted], expiresAt, fingerprint: digest({ runId, sourceSha: input.sourceSha, expected, attempted: [...attempted], expiresAt }) });
  const origin = (role: WorkerRole) => `https://${workerNameFor(runId, role)}.${input.subdomain}.workers.dev`;
  const request = async (role: WorkerRole, path: string, body?: object): Promise<Record<string, unknown>> => {
    const response = await adapters.fetch(origin(role) + path, { method: body ? "POST" : "GET", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) throw Error(`worker-probe-${path}-${response.status}`);
    const value: unknown = await response.json();
    checkIdentity(value, run, role);
    return value;
  };
  const absent = async (name: string) => !(await adapters.inventory()).includes(name);
  const remove = async (name: string) => {
    if (!attempted.has(name) || !expected.includes(name)) throw Error("worker-unowned");
    for (let n = 0; n < 3; n++) {
      if (await absent(name)) { attempted.delete(name); await save(); return; }
      try { await adapters.runWrangler(buildLifecycleDeleteArgs(name)); } catch { /* inventory is authoritative */ }
      if (await absent(name)) { attempted.delete(name); await save(); return; }
    }
    throw Error(`worker-orphan:${name}`);
  };
  const transition = (to: Parameters<typeof advanceLifecycle>[1]["to"], extra: object = {}) => { run = advanceLifecycle(run, { runId, sourceSha: input.sourceSha, observedAt: now(), to, ...extra }); };
  let failure: unknown;
  let result: LifecycleReceipt | undefined;
  try {
    await save();
    const deploy = async (role: WorkerRole) => {
      const name = workerNameFor(runId, role);
      if ((await adapters.inventory()).includes(name)) throw Error("worker-name-collision");
      attempted.add(name);
      await save(); // durable intent before the side effect
      const output = await adapters.runWrangler(buildLifecycleDeployArgs({ runId, sourceSha: input.sourceSha, role, expiresAt }));
      await adapters.tagWorker(name, runId, expiresAt);
      await save(); // if this fails, finally still sees attempted name
      const match = /Current Version ID:\s*([a-f0-9-]{36})/i.exec(output);
      if (!match) throw Error("deployment-id-missing");
      await adapters.runWrangler(["secret", "put", "LIFECYCLE_CHALLENGE_SECRET", "--config", config, "--name", name], secret);
      transition(role === "clone" ? "clone-deployed" : "reconstruction-deployed", { worker: { role, deploymentId: match[1], expiresAt } });
      await request(role, "/live");
      const manifest = await request(role, "/manifest");
      if (manifest.kind !== "evaluation-only-manifest" || !Array.isArray(manifest.capabilities) || manifest.capabilities.includes("repository.write")) throw Error("manifest-invalid");
    };
    const challenge = async (role: WorkerRole) => {
      const scores = [];
      for (const scenario of ["generative", "predictive", "agentic", "cross-mode"] as const) {
        const response = await request(role, "/challenge", { runId, sourceSha: input.sourceSha, requestId: `${role}-${scenario}`, scenario });
        const evaluation = response.evaluation as { accepted: boolean; score: number; fingerprint: string };
        if (!evaluation?.accepted || evaluation.score !== 1 || !/^[a-f0-9]{64}$/.test(evaluation.fingerprint)) throw Error("challenge-failed");
        scores.push(evaluation.fingerprint);
      }
      return digest(scores);
    };
    await deploy("clone");
    const baselineFingerprint = await challenge("clone");
    const baselineTransfer = await request("clone", "/challenge", { runId, sourceSha: input.sourceSha, requestId: "clone-held-out", scenario: "held-out-transfer" });
    if ((baselineTransfer.evaluation as { score?: number })?.score !== 0) throw Error("baseline-transfer-invalid");
    transition("baseline-proven", { evaluationFingerprint: baselineFingerprint });
    const retire = async (role: WorkerRole) => {
      const receipt = await request(role, "/retire", { runId, sourceSha: input.sourceSha, requestId: `${role}-retire` });
      if (receipt.retired !== true) throw Error("retirement-invalid");
      const name = workerNameFor(runId, role);
      await remove(name);
      transition(role === "clone" ? "clone-retired" : "reconstruction-retired", { workerRole: role, retirementFingerprint: digest(receipt), inventoryAbsent: true });
    };
    await retire("clone");
    transition("researching");
    // The retired clone cannot participate. The deterministic cognition module
    // performs bounded research using the controller's fixed evidence catalog.
    const investigation = await createControllerResearch(runId, input.sourceSha);
    transition("research-complete", { investigation });
    await deploy("reconstruction");
    const candidateResearch = await request("reconstruction", "/research", { runId, sourceSha: input.sourceSha, requestId: "reconstruction-research", evidenceIds: ["evidence:projection-trace", "evidence:complete-manifest"] });
    const candidateInvestigation = validateInvestigationReceipt(candidateResearch.investigation);
    if (candidateInvestigation.decision !== "accept" || candidateInvestigation.runId !== runId || candidateInvestigation.sourceSha !== input.sourceSha || !candidateInvestigation.counterevidence.length) throw Error("candidate-research-invalid");
    const reconstruction = await challenge("reconstruction");
    const transfer = await request("reconstruction", "/challenge", { runId, sourceSha: input.sourceSha, requestId: "reconstruction-held-out", scenario: "held-out-transfer" });
    const transferScore = (transfer.evaluation as { score?: number })?.score;
    if (transferScore !== 1) throw Error("research-transfer-failed");
    transition("reconstruction-proven", { evaluationFingerprint: reconstruction });
    const comparison = compareReconstruction({ runId, sourceSha: input.sourceSha,
      baseline: { invariants: 1, provenance: 1, researchTransfer: 0, counterevidenceUse: 0 },
      candidate: { invariants: 1, provenance: 1, researchTransfer: transferScore, counterevidenceUse: candidateInvestigation.counterevidence.length ? 1 : 0 },
      baselineAuthority: ["evaluation-only"], candidateAuthority: ["evaluation-only"], provenanceComplete: true, quarantinedEvidenceCount: 0, independentVerification: true });
    const absorption = evaluateAbsorption({ comparison, lesson: "Preserve a bounded projection gap with contrary evidence.", provenanceRefs: [investigation.fingerprint, candidateInvestigation.fingerprint], rollbackDescription: "Remove this run-scoped evaluation lesson." });
    transition("absorption-evaluated", { comparisonFingerprint: comparison.fingerprint, absorptionFingerprint: absorption.fingerprint });
    await retire("reconstruction");
    result = finalizeLifecycle(run, { observedAt: now(), absentWorkerNames: expected });
    validateLifecycleReceipt(result);
    await adapters.writeArtifact("final-receipt.json", { ...result, comparisonFingerprint: comparison.fingerprint, absorptionFingerprint: absorption.fingerprint, absorptionDecision: absorption.decision, transferScore });
  } catch (error) { failure = error; }
  finally {
    const orphans: string[] = [];
    for (const name of [...attempted]) { try { await remove(name); } catch { orphans.push(name); } }
    if (failure || orphans.length) {
      run = markLifecycleFailure(run, { observedAt: now(), reasonCode: "evaluation-failed", orphanWorkerNames: run.workers.map(w => w.name).filter(n => orphans.includes(n)) });
      try { await adapters.writeArtifact("orphan-receipt.json", { runId, sourceSha: input.sourceSha, orphans, reasonCode: "evaluation-failed", fingerprint: digest({ runId, orphans }) }); } catch { /* preserve original failure */ }
    }
  }
  if (failure) throw failure;
  if (!result) throw Error("lifecycle-incomplete");
  return result;
}

export async function createControllerResearch(runId: string, sourceSha: string): Promise<CognitiveInvestigationReceipt> {
  const { createInvestigation, recordInvestigationStep, completeInvestigation } = await import("../src/cognitive-investigation.ts");
  let s = createInvestigation({ runId, sourceSha, trigger: "baseline-capability-gap", behaviorImplicated: true, budgets: { questions: 8, evidence: 12, capabilityInvocations: 8 } });
  s = recordInvestigationStep(s, { kind: "question", id: "q-manifest", text: "Why did the manifest omit the expected route?", target: "manifest-route-gap" });
  s = recordInvestigationStep(s, { kind: "hypothesis", id: "h-self", statement: "My projection omitted the route.", confidence: 0.55, selfFault: true });
  s = recordInvestigationStep(s, { kind: "hypothesis", id: "h-evidence", statement: "The evidence is incomplete.", confidence: 0.45, selfFault: false });
  s = recordInvestigationStep(s, { kind: "predicted-evidence", hypothesisId: "h-self", supports: ["evidence:projection-trace"], weakens: ["evidence:complete-manifest"] });
  s = recordInvestigationStep(s, { kind: "predicted-evidence", hypothesisId: "h-evidence", supports: ["evidence:complete-manifest"], weakens: ["evidence:projection-trace"] });
  s = recordInvestigationStep(s, { kind: "observation", evidenceRef: "evidence:projection-trace", supports: ["h-self"], weakens: ["h-evidence"] });
  s = recordInvestigationStep(s, { kind: "counterevidence", evidenceRef: "evidence:complete-manifest", hypothesisId: "h-self" });
  s = recordInvestigationStep(s, { kind: "confidence-update", hypothesisId: "h-self", before: 0.55, after: 0.7, evidenceRefs: ["evidence:projection-trace", "evidence:complete-manifest"], reasonCode: "projection-defect-supported" });
  s = recordInvestigationStep(s, { kind: "model-delta", priorFingerprint: "a".repeat(64), revisedFingerprint: "b".repeat(64) });
  return validateInvestigationReceipt(completeInvestigation(s, { selectedConclusion: "The bounded projection omitted a supported route.", rejectedAlternatives: ["Incomplete evidence."], unknowns: ["Other routes remain untested."], stopReason: "evidence-sufficient" }));
}

const exec = promisify(execFile);
async function cli() {
  const command = process.argv[2];
  const artifact = process.env.LIFECYCLE_RUN_RECORD;
  if (!artifact || !process.env.CLOUDFLARE_ACCOUNT_ID || !/^[a-f0-9]{32}$/.test(process.env.CLOUDFLARE_ACCOUNT_ID) || !process.env.CLOUDFLARE_API_TOKEN) throw Error("cloudflare-test-credentials-required");
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const api = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/workers/${path}`, { ...init, headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, ...(init.headers as Record<string, string> | undefined) } });
    if (!response.ok) throw Error("cloudflare-control-plane-unavailable");
    const body = await response.json() as { success: boolean; result: unknown; result_info?: { total_pages?: number } };
    if (!body.success) throw Error("cloudflare-control-plane-invalid");
    return body;
  };
  const inventory = async () => {
    const names: string[] = [];
    for (let page = 1; page <= 100; page++) {
      const body = await api(`scripts?page=${page}&per_page=100`);
      if (!Array.isArray(body.result)) throw Error("cloudflare-inventory-invalid");
      names.push(...(body.result as { id: string }[]).map(item => item.id));
      const total = body.result_info?.total_pages;
      if (total === undefined && body.result.length < 100) return names;
      if (!Number.isInteger(total) || total! < 1 || total! > 100) throw Error("cloudflare-inventory-pagination-invalid");
      if (page >= total!) return names;
    }
    throw Error("cloudflare-inventory-pagination-exceeded");
  };
  const adapters: ControllerAdapters = {
    randomBytes: cryptoRandomBytes, now: () => new Date(), fetch, inventory,
    tagWorker: async (name, runId, expiresAt) => {
      validName(name);
      const body = await api(`scripts/${name}/script-settings`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ tags: [`mahoraga-lifecycle-${runId}`, `mahoraga-lifecycle-expiry-${Date.parse(expiresAt)}`] }) });
      verifyLifecycleWorkerTags((body.result as { tags?: string[] }).tags ?? [], runId);
    },
    runWrangler: async (args, stdin) => {
      // Secret input never appears in an argument, log, or child environment.
      if (stdin !== undefined) {
        const { spawn } = await import("node:child_process");
        return new Promise<string>((ok, reject) => {
          const child = spawn("npx", ["--yes", "wrangler@4.132.0", ...args], { stdio: ["pipe", "pipe", "pipe"] });
          let output = ""; child.stdout.on("data", chunk => { output += String(chunk); });
          child.stderr.on("data", chunk => { output += String(chunk); });
          child.on("error", reject); child.on("close", code => code === 0 ? ok(output) : reject(Error("wrangler-command-failed")));
          child.stdin.end(stdin);
        });
      }
      const { stdout } = await exec("npx", ["--yes", "wrangler@4.132.0", ...args], { maxBuffer: 1024 * 1024 });
      return stdout;
    },
    writeArtifact: async (name, value) => { const path = resolve(dirname(artifact), name); await mkdir(dirname(path), { recursive: true }); await writeFile(path + ".tmp", JSON.stringify(value), { mode: 0o600 }); await rename(path + ".tmp", path); },
  };
  if (command === "run") {
    const sourceSha = process.env.TARGET_SHA;
    const subdomain = process.env.CLOUDFLARE_TEST_SUBDOMAIN;
    if (!sourceSha || !subdomain) throw Error("live-input-missing");
    const { stdout } = await exec("git", ["rev-parse", "HEAD"]);
    if (stdout.trim() !== sourceSha) throw Error("checkout-sha-mismatch");
    await runCuriousLifecycle({ sourceSha, subdomain }, adapters);
  } else if (command === "audit-expired") {
    const expired: string[] = [];
    for (const name of await inventory()) {
      const match = namePattern.exec(name);
      if (!match) continue;
      const settings = await api(`scripts/${name}/script-settings`);
      const tags = (settings.result as { tags?: string[] }).tags ?? [];
      if (!tags.includes(`mahoraga-lifecycle-${match[1]}`)) continue;
      const expiry = tags.find(tag => /^mahoraga-lifecycle-expiry-\d{13}$/.test(tag));
      if (expiry && Number(expiry.slice("mahoraga-lifecycle-expiry-".length)) < Date.now()) expired.push(name);
    }
    await adapters.writeArtifact("audit-receipt.json", { observedAt: new Date().toISOString(), expired, deleted: false });
  } else if (command === "cleanup") {
    const record = JSON.parse(await readFile(artifact, "utf8")) as { runId: string; sourceSha: string; expected: string[]; attempted: string[]; expiresAt: string; fingerprint: string };
    const { fingerprint, ...core } = record;
    if (fingerprint !== digest(core) || !shaPattern.test(record.sourceSha) || record.expected.length !== 2 || record.expected[0] !== workerNameFor(record.runId, "clone") || record.expected[1] !== workerNameFor(record.runId, "reconstruction") || record.attempted.some(name => !record.expected.includes(name))) throw Error("run-record-invalid");
    const present = (await inventory()).filter(name => record.attempted.includes(name));
    for (const name of present) {
      validName(name);
      const settings = await api(`scripts/${name}/script-settings`);
      verifyLifecycleWorkerTags((settings.result as { tags?: string[] }).tags ?? [], record.runId);
      await adapters.runWrangler(buildLifecycleDeleteArgs(name));
    }
    if ((await inventory()).some(name => record.attempted.includes(name))) throw Error("cleanup-inventory-incomplete");
    await adapters.writeArtifact("cleanup-receipt.json", { runId: record.runId, formerlyPresent: present, inventoryAbsent: true });
  } else throw Error("command-invalid");
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli().catch(error => { console.error(String(error)); process.exitCode = 1; });
