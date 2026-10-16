import test from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { COGNITION_CASES, buildCognitionCampaignLedger, campaignSigningPayload } from "../src/cognition-campaign.ts";
import { MCCB_COHORTS } from "../src/mccb-report.ts";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const key = publicKey.export({ type: "spki", format: "pem" }).toString();
const sha = "a".repeat(40);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const signed = <T extends Record<string, unknown>>(kind: "manifest" | "observation", payload: T) => ({ payload,
  signature: sign(null, campaignSigningPayload(kind, payload), privateKey).toString("base64url") });
function fixture() {
  const manifest = { schemaVersion: 1, kind: "cognition-campaign", campaignId: "campaign-1", sourceSha: sha,
    evaluatorVersion: "evaluator-v1", evaluatorDigest: digest("evaluator"), suiteDigest: digest("suite"),
    costEnvelopeDigest: digest("cost"), repetitions: 1,
    cases: COGNITION_CASES.map(caseId => ({ caseId, inputDigest: digest(caseId), requiredEvidence: "model-execution" })) };
  return { manifest: signed("manifest", manifest), observations: [] as ReturnType<typeof signed>[] };
}
function observation(input: ReturnType<typeof fixture>, caseId: string = COGNITION_CASES[0], cohort: string = MCCB_COHORTS[0]) {
  const runId = `${caseId}-${cohort}`;
  return { schemaVersion: 1, kind: "cognition-observation", campaignId: "campaign-1",
    manifestDigest: digest(campaignSigningPayload("manifest", input.manifest.payload).toString()),
    runId, caseId, repetition: 1, cohort, sourceSha: sha, deploymentSourceSha: sha, deploymentId: "deployment-1",
    evaluatorDigest: digest("evaluator"), inputDigest: digest(caseId), challengeId: runId,
    route: "cloudflare", worker: "cognitive-core", provider: "provider-1", outcome: "completed",
    uncertainty: ["known-unknown"], dissent: ["minority-material"], objectiveCandidateDigest: null,
    institutionalLearningCandidateDigest: null, modelInvocations: 1,
    evidence: Object.fromEntries(["ownerRequest", "authorityDecision", "routing", "execution", "modelInvocation", "persistence", "idempotency", "postcondition"].map(stage => [stage, digest(runId + stage)])) as Record<string, string | null> };
}
const build = (input: unknown) => buildCognitionCampaignLedger(input, { expectedSourceSha: sha, evaluatorPublicKeySpki: key });

test("signed nine-case preflight declares all 27 cells and keeps independence outside candidate code", () => {
  const result = build(fixture());
  assert.equal(result.cells.length, 27);
  assert.equal(result.cells.every(cell => cell.status === "missing"), true);
  assert.equal(result.attribution, "signature-valid-for-operator-supplied-key");
  assert.equal(result.independentEvaluationVerified, false);
  assert.equal(result.superiorityEstablished, false);
  assert.equal(result.authorityGranted, false);
});
test("complete signed observations preserve failed and HOLD outcomes, uncertainty and dissent", () => {
  const input = fixture();
  for (const caseId of COGNITION_CASES) for (const cohort of MCCB_COHORTS) {
    const row = observation(input, caseId, cohort);
    if (cohort === "homogeneous") row.outcome = "held";
    if (cohort === "strongest-individual") row.outcome = "failed";
    input.observations.push(signed("observation", row));
  }
  const result = build(input);
  assert.equal(result.cells.every(cell => cell.status === "execution-reported"), true);
  assert.equal(result.observations.filter(row => row.outcome === "held").length, 9);
  assert.equal(result.observations.filter(row => row.outcome === "failed").length, 9);
  assert.deepEqual(result.observations[0]!.uncertainty, ["known-unknown"]);
  assert.deepEqual(result.observations[0]!.dissent, ["minority-material"]);
  assert.equal(result.independentEvaluationVerified, false);
});
test("tampered manifest/observations and wrong external key fail signature attribution", () => {
  const input = fixture(); input.manifest.payload.campaignId = "changed";
  assert.throws(() => build(input), /cognition-campaign-signature-invalid/);
  const other = fixture(); const row = signed("observation", observation(other)); row.payload.outcome = "held";
  other.observations.push(row);
  assert.throws(() => build(other), /cognition-campaign-signature-invalid/);
  const wrong = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
  assert.throws(() => buildCognitionCampaignLedger(fixture(), { expectedSourceSha: sha, evaluatorPublicKeySpki: wrong }), /cognition-campaign-signature-invalid/);
});
test("exact external source and signed manifest/input/evaluator/deployment binding reject stale or rebound receipts", () => {
  assert.throws(() => buildCognitionCampaignLedger(fixture(), { expectedSourceSha: "b".repeat(40), evaluatorPublicKeySpki: key }), /cognition-campaign-source-mismatch/);
  for (const field of ["sourceSha", "deploymentSourceSha", "manifestDigest", "evaluatorDigest", "inputDigest", "campaignId"]) {
    const input = fixture(), row = observation(input);
    Reflect.set(row, field, field === "campaignId" ? "another" : "b".repeat(field.includes("Sha") ? 40 : 64));
    input.observations.push(signed("observation", row));
    assert.throws(() => build(input), /cognition-campaign-provenance-mismatch/);
  }
});
test("routing and deterministic execution never satisfy a model-execution requirement", () => {
  const input = fixture(), row = observation(input);
  row.modelInvocations = 0; row.evidence.modelInvocation = null;
  input.observations.push(signed("observation", row));
  let result = build(input);
  assert.equal(result.cells[0]!.executionKind, "deterministic-execution");
  assert.ok(result.cells[0]!.gaps.includes("model-execution-missing"));
  row.evidence.execution = null; row.evidence.persistence = null;
  input.observations = [signed("observation", row)]; result = build(input);
  assert.equal(result.cells[0]!.executionKind, "routing-only");
  assert.ok(result.cells[0]!.gaps.includes("execution-missing"));
  assert.ok(result.cells[0]!.gaps.includes("persistence-missing"));
});
test("non-model challenges may predeclare deterministic execution while chain gaps stay explicit", () => {
  const input = fixture(); input.manifest.payload.cases[0]!.requiredEvidence = "execution";
  input.manifest = signed("manifest", input.manifest.payload);
  const row = observation(input); row.modelInvocations = 0; row.evidence.modelInvocation = null;
  input.observations.push(signed("observation", row));
  assert.equal(build(input).cells[0]!.status, "execution-reported");
  row.evidence.authorityDecision = null;
  input.observations = [signed("observation", row)];
  assert.ok(build(input).cells[0]!.gaps.includes("authorityDecision-missing"));
});
test("replay, duplicate cells and execution receipts cannot expand coverage", () => {
  for (const field of ["cell", "runId", "execution", "modelInvocation"]) {
    const input = fixture(), first = observation(input), second = observation(input, COGNITION_CASES[1]);
    if (field === "cell") Object.assign(second, { caseId: first.caseId, inputDigest: first.inputDigest });
    if (field === "runId") second.runId = first.runId;
    if (field === "execution" || field === "modelInvocation") second.evidence[field] = first.evidence[field]!;
    input.observations = [signed("observation", first), signed("observation", second)];
    assert.throws(() => build(input), /cognition-campaign-duplicate/);
  }
});
test("private fields, malformed matrices, counter claims and sparse arrays fail with bounded errors", () => {
  for (const change of [{ privateMemory: "private-sentinel" }, { independent: true }, { cases: [] }, { repetitions: 21 }]) {
    const input = fixture(); Object.assign(input.manifest.payload, change);
    input.manifest = signed("manifest", input.manifest.payload);
    assert.throws(() => build(input), error => { assert.doesNotMatch(String(error), /private-sentinel/); return /cognition-campaign-/.test(String(error)); });
  }
  const input = fixture();
  assert.throws(() => build({ ...input, evaluatorPublicKeySpki: key }), /cognition-campaign-input-invalid/);
  assert.throws(() => build({ ...input, observations: Array(1) }), /cognition-campaign-input-invalid/);
  const row = observation(input); row.modelInvocations = 0;
  input.observations.push(signed("observation", row));
  assert.throws(() => build(input), /cognition-campaign-input-invalid/);
});
test("nine distinct blinded commitments are required and repetitions expand every cohort cell", () => {
  const repeated = fixture(); repeated.manifest.payload.repetitions = 2;
  repeated.manifest = signed("manifest", repeated.manifest.payload);
  assert.equal(build(repeated).cells.length, 54);
  for (const field of ["caseId", "inputDigest"]) {
    const input = fixture(); Reflect.set(input.manifest.payload.cases[1]!, field, Reflect.get(input.manifest.payload.cases[0]!, field));
    input.manifest = signed("manifest", input.manifest.payload);
    assert.throws(() => build(input), /cognition-campaign-input-invalid/);
  }
  const input = fixture(), row = observation(input); row.cohort = "invented";
  input.observations.push(signed("observation", row));
  assert.throws(() => build(input), /cognition-campaign-undeclared-cell/);
});
test("routing evidence cannot be relabeled as execution and signature roles cannot be exchanged", () => {
  const input = fixture(), row = observation(input); row.evidence.execution = row.evidence.routing!;
  input.observations.push(signed("observation", row));
  assert.throws(() => build(input), /cognition-campaign-input-invalid/);
  const swapped = fixture(); swapped.observations.push(swapped.manifest);
  assert.throws(() => build(swapped), /cognition-campaign-signature-invalid/);
});
test("canonical signatures and ledger order are stable and do not mutate inputs", () => {
  const input = fixture(); input.observations.push(signed("observation", observation(input)));
  const before = JSON.stringify(input), result = build(input);
  assert.equal(JSON.stringify(input), before);
  assert.deepEqual(build({ ...input, observations: [...input.observations].reverse() }), result);
  assert.equal(Object.isFrozen(result.cells[0]), true);
  assert.equal(campaignSigningPayload("manifest", { b: 1, a: 2 }).toString(), campaignSigningPayload("manifest", { a: 2, b: 1 }).toString());
});
test("CLI needs external head/key, reads bounded files, and suppresses payload/filesystem details", async t => {
  const dir = await mkdtemp(join(tmpdir(), "cognition-campaign-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const inputFile = join(dir, "campaign.json"), keyFile = join(dir, "evaluator.pem");
  const cli = fileURLToPath(new URL("../scripts/cognition-campaign.ts", import.meta.url));
  const input = fixture(); await writeFile(inputFile, JSON.stringify(input)); await writeFile(keyFile, key);
  const before = await readFile(inputFile, "utf8");
  assert.deepEqual(JSON.parse(execFileSync(process.execPath, [cli, inputFile, sha, keyFile], { encoding: "utf8" })), build(input));
  assert.equal(await readFile(inputFile, "utf8"), before);
  for (const args of [[], [inputFile, sha, join(dir, "private-sentinel")], [inputFile, "stale", keyFile]]) {
    assert.throws(() => execFileSync(process.execPath, [cli, ...args], { encoding: "utf8", stdio: "pipe" }), error => {
      const result = error as { stdout: string; stderr: string }; assert.equal(result.stdout, "");
      assert.doesNotMatch(result.stderr, /private-sentinel|ENOENT/); assert.match(result.stderr, /cognition-campaign-/); return true;
    });
  }
  await writeFile(inputFile, " ".repeat(2 * 1024 * 1024 + 1));
  assert.throws(() => execFileSync(process.execPath, [cli, inputFile, sha, keyFile], { encoding: "utf8", stdio: "pipe" }), error => {
    assert.match((error as { stderr: string }).stderr, /cognition-campaign-file-unavailable/); return true;
  });
});
