import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";

const secret = "lifecycle-local-test-secret";
const headers = { authorization: `Bearer ${secret}`, "content-type": "application/json" };
const post = (path: string, body: object, auth: HeadersInit = headers) => SELF.fetch(`https://test.invalid${path}`, { method: "POST", headers: auth, body: JSON.stringify(body) });

describe("disposable lifecycle worker", () => {
  it("exposes only run-bound evaluation routes and no-store responses", async () => {
    const live = await SELF.fetch("https://test.invalid/live");
    expect(live.status).toBe(200);
    expect(live.headers.get("cache-control")).toBe("no-store");
    expect((await live.json() as { runId: string }).runId).toBe("abc123def456");
    expect((await SELF.fetch("https://test.invalid/manifest")).status).toBe(401);
    const manifest = await SELF.fetch("https://test.invalid/manifest", { headers });
    const content = await manifest.text();
    expect(manifest.status).toBe(200);
    expect(content).toContain("self.question");
    expect(content).not.toMatch(/assistant.respond|repository.write|deployment|connector/);
    expect((await SELF.fetch("https://test.invalid/deploy", { headers })).status).toBe(404);
  });

  it("binds challenge and research to the exact run and rejects replay", async () => {
    const bad = await post("/challenge", { runId: "other", sourceSha: "b".repeat(40), scenario: "generative", requestId: "wrong" });
    expect(bad.status).toBe(400);
    const input = { runId: "abc123def456", sourceSha: "b".repeat(40), scenario: "generative", requestId: "challenge-one" };
    const first = await post("/challenge", input);
    expect(first.status).toBe(200);
    expect((await first.json() as { evaluation: { accepted: boolean } }).evaluation.accepted).toBe(true);
    expect((await post("/challenge", input)).status).toBe(409);
    const heldOutBefore = await post("/challenge", { ...input, scenario: "held-out-transfer", requestId: "held-out-before" });
    expect((await heldOutBefore.json() as { evaluation: { score: number } }).evaluation.score).toBe(0);
    for (const scenario of ["predictive", "agentic", "cross-mode"]) {
      const result = await post("/challenge", { ...input, scenario, requestId: scenario });
      expect(result.status).toBe(200);
    }
    const research = await post("/research", { runId: input.runId, sourceSha: input.sourceSha, requestId: "research-one", evidenceIds: ["evidence:projection-trace", "evidence:complete-manifest"] });
    expect(research.status).toBe(200);
    const packet = await research.json() as { investigation: { counterevidence: unknown[]; fingerprint: string } };
    expect(packet.investigation.counterevidence).toHaveLength(1);
    expect(packet.investigation.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    const heldOutAfter = await post("/challenge", { ...input, scenario: "held-out-transfer", requestId: "held-out-after" });
    expect((await heldOutAfter.json() as { evaluation: { score: number } }).evaluation.score).toBe(1);
    expect((await post("/research", { runId: input.runId, sourceSha: input.sourceSha, requestId: "research-one", evidenceIds: ["evidence:projection-trace", "evidence:complete-manifest"] })).status).toBe(409);
  });

  it("rejects unauthenticated and malformed requests", async () => {
    expect((await post("/challenge", {}, { "content-type": "application/json" })).status).toBe(401);
    expect((await post("/challenge", { runId: "abc123def456", sourceSha: "b".repeat(40), scenario: "unknown", requestId: "bad" })).status).toBe(400);
    expect((await SELF.fetch("https://test.invalid/research", { headers })).status).toBe(405);
  });

  it("erases bounded state and denies further challenges", async () => {
    const body = { runId: "abc123def456", sourceSha: "b".repeat(40), requestId: "retire-one" };
    const result = await post("/retire", body);
    expect(result.status).toBe(200);
    expect((await result.json() as { erasedRows: number }).erasedRows).toBeGreaterThan(0);
    expect((await post("/challenge", { ...body, requestId: "after-retire", scenario: "generative" })).status).toBe(410);
    expect((await post("/research", { ...body, requestId: "after-research", evidenceIds: ["evidence:projection-trace", "evidence:complete-manifest"] })).status).toBe(410);
  });
});
