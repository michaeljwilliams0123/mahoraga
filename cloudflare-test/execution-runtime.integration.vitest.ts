import { env, exports } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type ExecutionDurableObject } from "../deploy/cloudflare-execution-runtime/worker";

const SHA = "7cb8aab1129875f798347afdb2844f963e986a65";

const execute = (key: string, body: unknown, headers: Record<string, string> = {}) =>
  env.EXECUTION_DO.getByName(key).fetch("https://execution.example/api/execute", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-idempotency-key": key,
      "x-target-sha": SHA,
      ...headers,
    },
    body: JSON.stringify(body),
  });

afterEach(() => vi.restoreAllMocks());

describe("ExecutionDurableObject", () => {
  it("fails closed when deployment provenance is unset", async () => {
    const invalidEnv = {
      EXECUTION_DO: env.EXECUTION_DO,
      TARGET_SHA: "UNSET",
      RAILWAY_ANCHOR_URL: env.RAILWAY_ANCHOR_URL,
      BYPASS_SECRET: env.BYPASS_SECRET,
    } as Env;
    const live = await worker.fetch(new Request("https://execution.example/api/live"), invalidEnv);
    expect(live.status).toBe(503);
    expect(await live.json()).toEqual({ status: "unready", error: "target-sha-invalid" });

    const executeResponse = await worker.fetch(new Request("https://execution.example/api/execute", {
      method: "POST",
      headers: { "content-type": "application/json", "x-target-sha": "UNSET", "x-idempotency-key": "invalid-provenance" },
      body: JSON.stringify({ value: 1 }),
    }), invalidEnv);
    expect(executeResponse.status).toBe(503);
  });

  it("fails closed in the public Worker before creating a Durable Object schema", async () => {
    const response = await exports.default.fetch(new Request("https://execution.example/api/execute", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bypass-token": "test-bypass-secret-that-is-not-production",
        "x-idempotency-key": "outer-sha-mismatch",
        "x-target-sha": "stale-sha",
      },
      body: JSON.stringify({ mustNotRun: true }),
    }));
    expect(response.status).toBe(412);

    const stub = env.EXECUTION_DO.getByName("execution-v1");
    await runInDurableObject<ExecutionDurableObject, void>(stub, (_instance, state) => {
      const tables = state.storage.sql
        .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('leases', 'execution_receipts')")
        .toArray();
      expect(tables).toEqual([]);
    });
  });

  it("rejects a SHA mismatch before touching SQLite or applying bypass", async () => {
    const stub = env.EXECUTION_DO.getByName("sha-mismatch");
    const response = await stub.fetch("https://execution.example/api/execute", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bypass-token": "test-bypass-secret-that-is-not-production",
        "x-idempotency-key": "sha-mismatch",
        "x-target-sha": "7cb8aab...",
      },
      body: "{not-json",
    });

    expect(response.status).toBe(412);
    await runInDurableObject<ExecutionDurableObject, void>(stub, (_instance, state) => {
      const tables = state.storage.sql
        .exec<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('leases', 'execution_receipts')")
        .toArray();
      expect(tables).toEqual([]);
    });
  });

  it("replays the first receipt without executing a changed payload", async () => {
    const first = await execute("replay-key", { value: 1 });
    expect(first.status).toBe(200);
    expect(first.headers.get("x-idempotent-replay")).toBeNull();
    const firstBody = await first.json();

    const replay = await execute("replay-key", { value: 2 });
    expect(replay.status).toBe(200);
    expect(replay.headers.get("x-idempotent-replay")).toBe("true");
    expect(await replay.json()).toEqual(firstBody);
  });

  it("returns 409 when an active lease already owns the idempotency key", async () => {
    const stub = env.EXECUTION_DO.getByName("lease-contention");
    await stub.fetch("https://execution.example/api/ready");
    await runInDurableObject<ExecutionDurableObject, void>(stub, (_instance, state) => {
      state.storage.sql.exec(
        "INSERT INTO leases (resource_id, holder_id, expires_at) VALUES (?, ?, ?)",
        "execution:lease-contention",
        "other-holder",
        Date.now() + 60_000,
      );
    });

    const response = await stub.fetch("https://execution.example/api/execute", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-idempotency-key": "lease-contention",
        "x-target-sha": SHA,
      },
      body: JSON.stringify({ value: 1 }),
    });
    expect(response.status).toBe(409);
  });

  it("rolls back receipt writes when a transaction callback throws", async () => {
    const stub = env.EXECUTION_DO.getByName("rollback");
    await stub.fetch("https://execution.example/api/ready");
    await runInDurableObject<ExecutionDurableObject, void>(stub, (instance, state) => {
      expect(() => instance.storage.executeTransaction(() => {
        instance.storage.saveReceipt({
          id: "rollback-receipt",
          idempotencyKey: "rollback-key",
          status: "FAILED",
          resultPayload: { shouldPersist: false },
          createdAt: Date.now(),
        });
        throw new Error("abort");
      })).toThrow("abort");
      const row = state.storage.sql.exec<{ count: number }>("SELECT COUNT(*) AS count FROM execution_receipts").one();
      expect(row.count).toBe(0);
    });
  });

  it("proxies a valid emergency bypass without exposing the bypass secret", async () => {
    let forwarded: Request | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (request: RequestInfo | URL, init?: RequestInit) => {
      forwarded = new Request(request, init);
      return new Response(JSON.stringify({ railway: true }), {
        status: 202,
        headers: { "content-type": "application/json" },
      });
    });

    const response = await env.EXECUTION_DO.getByName("bypass").fetch(
      "https://execution.example/api/execute?source=edge",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-bypass-token": "test-bypass-secret-that-is-not-production",
          "x-target-sha": SHA,
        },
        body: JSON.stringify({ route: "railway" }),
      },
    );
    expect(response.status).toBe(202);
    expect(response.headers.get("x-bypass-applied")).toBe("true");
    expect(await response.json()).toEqual({ railway: true });
    expect(forwarded?.url).toBe("https://mahoraga-runtime-main-production.up.railway.app/api/execute?source=edge");
    expect(forwarded?.headers.get("x-bypass-token")).toBeNull();
  });

  it("serves live and ready health routes and rejects the wrong method", async () => {
    const stub = env.EXECUTION_DO.getByName("health");
    const live = await stub.fetch("https://execution.example/api/live");
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: "live", sha: SHA });

    const ready = await stub.fetch("https://execution.example/api/ready");
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({ status: "ready", sha: SHA });

    const method = await stub.fetch("https://execution.example/api/execute");
    expect(method.status).toBe(405);
    expect(method.headers.get("allow")).toBe("POST");
  });
});
