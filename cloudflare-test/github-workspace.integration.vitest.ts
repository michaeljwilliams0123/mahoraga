import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import worker from "../deploy/cloudflare-execution-runtime/worker";

const request = (payload: unknown, authenticated = true) => new Request("https://execution.example/api/native/bridge", {
  method: "POST", headers: { "content-type": "application/json", ...(authenticated ? { "x-mahoraga-verified-owner": "owner@example.com", "x-mahoraga-verified-nonce": crypto.randomUUID() } : {}) },
  body: JSON.stringify({ type: "native-github-workspace", payload }),
});

describe("native GitHub workspace read boundary", () => {
  it("requires signed owner identity at the public Worker boundary", async () => {
    expect((await worker.fetch(request({}), { ...env, OWNER_GATEWAY_SECRET: "a".repeat(64) })).status).toBe(403);
  });
  it("rejects caller-selected repository or URL on the authenticated route", async () => {
    const stub = env.EXECUTION_DO.getByName("github-workspace-guard");
    expect((await stub.fetch(request({}, false))).status).toBe(403);
    for (const payload of [{ repository: "other/repo" }, { url: "https://other.example" }]) {
      const response = await stub.fetch(request(payload));
      expect(response.status).toBe(400);
      expect((await response.json() as { error: string }).error).toBe("github-native-workspace-request-invalid");
    }
  });
  it("missing App credentials report unavailable sections without inventing access", async () => {
    const response = await env.EXECUTION_DO.getByName("github-workspace-unconfigured").fetch(request({}));
    expect(response.status).toBe(200);
    const snapshot = await response.json() as { readOnly: boolean; pages: { state: string }; actions: { state: string; runs: unknown[] } };
    expect(snapshot.readOnly).toBe(true);
    expect(snapshot.pages.state).toBe("unavailable");
    expect(snapshot.actions.state).toBe("unavailable");
    expect(snapshot.actions.runs).toEqual([]);
  });
});
