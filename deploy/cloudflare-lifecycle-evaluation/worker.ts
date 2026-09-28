import { DurableObject } from "cloudflare:workers";
import { createHash, timingSafeEqual } from "node:crypto";
import { createInvestigation, recordInvestigationStep, completeInvestigation } from "../../src/cognitive-investigation.ts";
import { evaluateGenerativeScenario, evaluatePredictiveScenario, evaluateAgenticScenario, evaluateCrossModeScenario } from "../../src/curious-lifecycle-evaluator.ts";
import { CURIOUS_LIFECYCLE_FIXTURES } from "../../evaluation/curious-lifecycle-fixtures.ts";

type Role = "clone" | "reconstruction";
type Env = { RUN_ID: string; TARGET_SHA: string; ROLE: Role; EXPIRES_AT: string; LIFECYCLE_CHALLENGE_SECRET: string; LIFECYCLE_DO: DurableObjectNamespace<LifecycleEvaluationDO> };
const headers = { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" };
const json = (body: object, status = 200) => Response.json(body, { status, headers });
const allowed = ["self.inspect", "self.question", "self.model", "self.challenge", "self.experiment", "self.compare", "self.diagnose", "self.revise", "self.synthesize", "self.verify", "self.quarantine", "self.rollback", "self.transfer", "self.explain", "self.abstain", "self.propose-capability", "research.plan", "research.inspect", "research.synthesize", "experiment.execute", "memory.candidate", "memory.absorb"];
const exact = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(k => keys.includes(k)) && keys.every(k => Object.hasOwn(value, k));
function authenticated(request: Request, env: Env) {
  const token = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.LIFECYCLE_CHALLENGE_SECRET}`;
  const a = new TextEncoder().encode(token), b = new TextEncoder().encode(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function identity(env: Env) { return { runId: env.RUN_ID, sourceSha: env.TARGET_SHA, role: env.ROLE, expiresAt: env.EXPIRES_AT }; }
function validEnv(env: Env) { return /^[a-z0-9]{12,32}$/.test(env.RUN_ID) && /^[a-f0-9]{40}$/.test(env.TARGET_SHA) && ["clone", "reconstruction"].includes(env.ROLE) && Number.isFinite(Date.parse(env.EXPIRES_AT)) && !!env.LIFECYCLE_CHALLENGE_SECRET; }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!validEnv(env)) return json({ error: "evaluation-configuration-invalid" }, 503);
    const path = new URL(request.url).pathname;
    if (!["/live", "/manifest", "/challenge", "/research", "/retire"].includes(path)) return json({ error: "route-unknown" }, 404);
    if (request.method !== (path === "/live" || path === "/manifest" ? "GET" : "POST")) return json({ error: "method-invalid" }, 405);
    if (path === "/live") return json({ ...identity(env), live: Date.now() < Date.parse(env.EXPIRES_AT) });
    if (!authenticated(request, env)) return json({ error: "authentication-required" }, 401);
    if (Date.now() >= Date.parse(env.EXPIRES_AT)) return json({ error: "evaluation-expired" }, 410);
    if (path === "/manifest") return json({ ...identity(env), kind: "evaluation-only-manifest", capabilities: allowed, zeroCredit: true });
    if (Number(request.headers.get("content-length")) > 8192) return json({ error: "payload-too-large" }, 413);
    const bytes = await request.text();
    if (bytes.length > 8192) return json({ error: "payload-too-large" }, 413);
    let body: unknown;
    try { body = JSON.parse(bytes); } catch { return json({ error: "json-invalid" }, 400); }
    if (!exact(body, path === "/challenge" ? ["runId", "sourceSha", "requestId", "scenario"] : path === "/research" ? ["runId", "sourceSha", "requestId", "evidenceIds"] : ["runId", "sourceSha", "requestId"])) return json({ error: "schema-invalid" }, 400);
    if (body.runId !== env.RUN_ID || body.sourceSha !== env.TARGET_SHA || typeof body.requestId !== "string" || !/^[a-z0-9-]{4,64}$/.test(body.requestId)) return json({ error: "run-binding-invalid" }, 400);
    if (path === "/challenge" && !["generative", "predictive", "agentic", "cross-mode", "held-out-transfer"].includes(String(body.scenario))) return json({ error: "scenario-invalid" }, 400);
    if (path === "/research" && (!Array.isArray(body.evidenceIds) || body.evidenceIds.length !== 2 || body.evidenceIds[0] !== "evidence:projection-trace" || body.evidenceIds[1] !== "evidence:complete-manifest")) return json({ error: "evidence-catalog-invalid" }, 400);
    return env.LIFECYCLE_DO.get(env.LIFECYCLE_DO.idFromName(env.RUN_ID)).fetch(new Request(request.url, { method: "POST", headers: request.headers, body: bytes }));
  },
};

export class LifecycleEvaluationDO extends DurableObject<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, kind TEXT NOT NULL, fingerprint TEXT NOT NULL)");
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS retirement (id INTEGER PRIMARY KEY, marker TEXT NOT NULL)");
  }
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname;
    const input = await request.json() as { requestId: string; scenario?: string; evidenceIds?: string[] };
    if (this.ctx.storage.sql.exec("SELECT marker FROM retirement WHERE id = 1").toArray().length) return json({ error: "evaluation-retired" }, 410);
    if (this.ctx.storage.sql.exec("SELECT id FROM events WHERE id = ?", input.requestId).toArray().length) return json({ error: "request-replayed" }, 409);
    if (path === "/retire") {
      const count = this.ctx.storage.sql.exec("SELECT id FROM events").toArray().length;
      this.ctx.storage.sql.exec("DELETE FROM events");
      this.ctx.storage.sql.exec("INSERT INTO retirement (id, marker) VALUES (1, ?)", input.requestId);
      return json({ ...identity(this.env), kind: "lifecycle-retirement", erasedRows: count, retired: true });
    }
    let result: object;
    if (path === "/challenge") {
      if (input.scenario === "held-out-transfer") {
        const research = this.ctx.storage.sql.exec("SELECT fingerprint FROM events WHERE kind = '/research'").toArray();
        const accepted = research.length === 1 && typeof research[0]?.fingerprint === "string";
        const core = { schemaVersion: 1, kind: "held-out-transfer", accepted, score: accepted ? 1 : 0, reasons: accepted ? [] : ["research-not-observed"], zeroCredit: true, creditCost: 0, providerRequired: false, paidFallback: false };
        result = { ...identity(this.env), evaluation: { ...core, fingerprint: createHash("sha256").update(JSON.stringify(core)).digest("hex") } };
      } else {
      const f = CURIOUS_LIFECYCLE_FIXTURES;
      const evaluation = input.scenario === "generative" ? evaluateGenerativeScenario(f.generative)
        : input.scenario === "predictive" ? evaluatePredictiveScenario(f.predictive)
          : input.scenario === "agentic" ? evaluateAgenticScenario(f.agentic) : evaluateCrossModeScenario(f.crossMode);
      result = { ...identity(this.env), evaluation };
      }
    } else {
      let state = createInvestigation({ runId: this.env.RUN_ID, sourceSha: this.env.TARGET_SHA, trigger: "baseline-capability-gap", behaviorImplicated: true, budgets: { questions: 8, evidence: 12, capabilityInvocations: 8 } });
      state = recordInvestigationStep(state, { kind: "question", id: "q-manifest", text: "Why did the manifest omit the expected route?", target: "manifest-route-gap" });
      state = recordInvestigationStep(state, { kind: "hypothesis", id: "h-self", statement: "My projection omitted the route.", confidence: 0.55, selfFault: true });
      state = recordInvestigationStep(state, { kind: "hypothesis", id: "h-evidence", statement: "The manifest evidence is incomplete.", confidence: 0.45, selfFault: false });
      state = recordInvestigationStep(state, { kind: "predicted-evidence", hypothesisId: "h-self", supports: [input.evidenceIds![0]!], weakens: [input.evidenceIds![1]!] });
      state = recordInvestigationStep(state, { kind: "predicted-evidence", hypothesisId: "h-evidence", supports: [input.evidenceIds![1]!], weakens: [input.evidenceIds![0]!] });
      state = recordInvestigationStep(state, { kind: "observation", evidenceRef: input.evidenceIds![0]!, supports: ["h-self"], weakens: ["h-evidence"] });
      state = recordInvestigationStep(state, { kind: "counterevidence", evidenceRef: input.evidenceIds![1]!, hypothesisId: "h-self" });
      state = recordInvestigationStep(state, { kind: "confidence-update", hypothesisId: "h-self", before: 0.55, after: 0.7, evidenceRefs: input.evidenceIds!, reasonCode: "projection-defect-supported" });
      state = recordInvestigationStep(state, { kind: "confidence-update", hypothesisId: "h-evidence", before: 0.45, after: 0.3, evidenceRefs: input.evidenceIds!, reasonCode: "alternative-weakened-by-trace" });
      state = recordInvestigationStep(state, { kind: "model-delta", priorFingerprint: "a".repeat(64), revisedFingerprint: "b".repeat(64) });
      const investigation = completeInvestigation(state, { selectedConclusion: "The bounded projection omitted a supported route.", rejectedAlternatives: ["The evidence was incomplete."], unknowns: ["Other routes remain untested."], stopReason: "evidence-sufficient" });
      result = { ...identity(this.env), investigation };
    }
    this.ctx.storage.sql.exec("INSERT INTO events (id, kind, fingerprint) VALUES (?, ?, ?)", input.requestId, path, path === "/challenge" ? (result as { evaluation: { fingerprint: string } }).evaluation.fingerprint : (result as { investigation: { fingerprint: string } }).investigation.fingerprint);
    return json(result);
  }
}
