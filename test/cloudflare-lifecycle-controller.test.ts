import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { buildLifecycleDeployArgs, buildLifecycleDeleteArgs, runCuriousLifecycle, createControllerResearch, verifyLifecycleWorkerTags, validateLifecycleRunRecord } from "../scripts/cloudflare-lifecycle-evaluation.ts";

const sha = "b".repeat(40);
const runId = "abc123def456";

test("controller derives exact worker names and fixed config", () => {
  const args = buildLifecycleDeployArgs({ runId, sourceSha: sha, role: "clone", expiresAt: "2099-01-01T00:00:00.000Z" });
  assert.deepEqual(args.slice(0, 4), ["deploy", "--config", "deploy/cloudflare-lifecycle-evaluation/wrangler.jsonc", "--name"]);
  assert.ok(args.includes(`mahoraga-lifecycle-test-${runId}-clone`));
  assert.ok(args.includes(`TARGET_SHA:${sha}`));
  assert.equal(args[args.indexOf("--tag") + 1], `mahoraga-lifecycle-${runId}`);
  assert.deepEqual(buildLifecycleDeleteArgs(`mahoraga-lifecycle-test-${runId}-clone`), ["delete", `mahoraga-lifecycle-test-${runId}-clone`, "--config", "deploy/cloudflare-lifecycle-evaluation/wrangler.jsonc"]);
  assert.throws(() => buildLifecycleDeleteArgs("mahoraga-production"), /worker-name-invalid/);
});

test("controller cleans a deployment even when persistence fails in the crash window", async () => {
  const calls: string[] = [];
  let deployed = false;
  const adapters = {
    randomBytes: () => Buffer.from(runId, "hex"), now: () => new Date("2026-09-28T20:00:00.000Z"),
    runWrangler: async (args: readonly string[]) => { calls.push(args[0] ?? ""); if (args[0] === "deploy") deployed = true; if (args[0] === "delete") deployed = false; return "Current Version ID: 12345678-1234-1234-1234-123456789abc"; },
    fetch: async () => { throw Error("no probe expected"); },
    inventory: async () => deployed ? [`mahoraga-lifecycle-test-${runId}-clone`] : [],
    tagWorker: async () => {},
    writeArtifact: async (_name: string, _value: unknown) => { if (deployed) throw Error("disk-full"); },
  };
  await assert.rejects(runCuriousLifecycle({ sourceSha: sha, subdomain: "test-account" }, adapters), /disk-full/);
  assert.deepEqual(calls, ["deploy", "delete"]);
  assert.deepEqual(await adapters.inventory(), []);
});

test("controller does not delete an unowned resource and refuses a wrong SHA", async () => {
  assert.throws(() => buildLifecycleDeployArgs({ runId, sourceSha: "main", role: "clone", expiresAt: "2099-01-01T00:00:00.000Z" }), /source-sha-invalid/);
  assert.throws(() => buildLifecycleDeleteArgs("mahoraga-lifecycle-test-abc123def456-other"), /worker-name-invalid/);
  assert.throws(() => verifyLifecycleWorkerTags(["some-other-run"], runId), /worker-ownership-unverified/);
  assert.doesNotThrow(() => verifyLifecycleWorkerTags([`mahoraga-lifecycle-${runId}`], runId));
});

test("controller proves each deletion before reconstructing and finalizes two workers", async () => {
  const live = new Set<string>();
  const actions: string[] = [];
  const saved: string[] = [];
  let liveProbeAttempts = 0;
  const sleeps: number[] = [];
  const adapters = {
    randomBytes: (n: number) => n === 6 ? Buffer.from(runId, "hex") : Buffer.alloc(n, 7),
    now: () => new Date("2026-09-28T20:00:00.000Z"),
    runWrangler: async (args: readonly string[]) => {
      actions.push(`${args[0]}:${args.includes("--name") ? args[args.indexOf("--name") + 1] : args[1]}`);
      if (args[0] === "deploy") { assert.equal(live.size, 0); live.add(args[args.indexOf("--name") + 1]!); }
      if (args[0] === "delete") live.delete(args[1]!);
      return "Current Version ID: 12345678-1234-1234-1234-123456789abc";
    },
    fetch: async (url: string, init: RequestInit) => {
      const role = url.includes("-clone.") ? "clone" : "reconstruction";
      const body = init.body ? JSON.parse(String(init.body)) as { scenario?: string } : {};
      if (url.endsWith("/live")) { liveProbeAttempts++; if (liveProbeAttempts === 1) return Response.json({ error: "not-ready" }, { status: 404 }); }
      if (url.endsWith("/manifest")) return Response.json({ runId, sourceSha: sha, role, kind: "evaluation-only-manifest", capabilities: ["self.question"] });
      if (url.endsWith("/research")) return Response.json({ runId, sourceSha: sha, role, investigation: await createControllerResearch(runId, sha) });
      if (url.endsWith("/challenge")) return Response.json({ runId, sourceSha: sha, role, evaluation: { accepted: true, score: body.scenario === "held-out-transfer" && role === "clone" ? 0 : 1, fingerprint: "a".repeat(64), scenario: body.scenario } });
      if (url.endsWith("/retire")) return Response.json({ runId, sourceSha: sha, role, retired: true, erasedRows: 4 });
      return Response.json({ runId, sourceSha: sha, role });
    },
    inventory: async () => [...live],
    tagWorker: async () => {},
    sleep: async (ms: number) => { sleeps.push(ms); },
    writeArtifact: async (name: string) => { saved.push(name); },
  };
  const receipt = await runCuriousLifecycle({ sourceSha: sha, subdomain: "test-account" }, adapters);
  assert.equal(receipt.state, "complete");
  assert.equal(receipt.workers.length, 2);
  assert.deepEqual([...live], []);
  assert.deepEqual(actions.filter(a => a.startsWith("delete:")), [`delete:mahoraga-lifecycle-test-${runId}-clone`, `delete:mahoraga-lifecycle-test-${runId}-reconstruction`]);
  assert.ok(saved.includes("final-receipt.json"));
  assert.equal(liveProbeAttempts, 3);
  assert.deepEqual(sleeps, [1000]);
});

test("cleanup run record validates schema separately from its fingerprint", () => {
  const core = { runId, sourceSha: sha, expected: [`mahoraga-lifecycle-test-${runId}-clone`, `mahoraga-lifecycle-test-${runId}-reconstruction`], attempted: [], expiresAt: "2099-01-01T00:00:00.000Z" };
  const fingerprint = createHash("sha256").update(JSON.stringify(core)).digest("hex");
  assert.doesNotThrow(() => validateLifecycleRunRecord({ schemaVersion: 1, ...core, fingerprint }));
  assert.throws(() => validateLifecycleRunRecord({ schemaVersion: 2, ...core, fingerprint }), /run-record-invalid/);
});
