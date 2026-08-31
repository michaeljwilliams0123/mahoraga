import test from "node:test";
import assert from "node:assert/strict";
import { createMcpHostManager } from "../src/mcp-host-manager.mjs";

const declaration = {
  id: "demo-mcp",
  enabled: true,
  transportKind: "local-process",
  executableIdentity: "demo-mcp-host",
  toolAllowlist: ["health", "invalid"],
  resourceAllowlist: [],
  dataClasses: ["synthetic"],
  permissionClass: "bounded-read",
  spendingClass: "deterministic",
  credentialReference: "env:DEMO_MCP_TOKEN",
  readinessProbe: "health",
  canary: "health",
  maximumRequestBytes: 1024,
  maximumResponseBytes: 2048,
  timeoutMs: 1000,
};

function manager() {
  return createMcpHostManager({ declarations: [declaration], transports: {
    "local-process": {
      async discover() { return [
        { id: "health", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
        { id: "invalid", inputSchema: { type: "array" } },
      ]; },
      async invoke(_provider, toolId, input) { return { toolId, input, status: "ok" }; },
    },
  } });
}

test("MCP discovery exposes only declared tools with valid object schemas", async () => {
  const host = manager();
  await host.refresh();
  assert.deepEqual(host.listTools(), [
    { providerId: "demo-mcp", toolId: "health", capabilityId: "demo-mcp.health", schemaValid: true, routable: true, reasonCode: null },
    { providerId: "demo-mcp", toolId: "invalid", capabilityId: "demo-mcp.invalid", schemaValid: false, routable: false, reasonCode: "schema-invalid" },
  ]);
  assert.deepEqual(await host.invoke("demo-mcp.health", {}, { dataClass: "synthetic", permissionClass: "bounded-read", spendingClass: "deterministic" }), { toolId: "health", input: {}, status: "ok" });
  await assert.rejects(() => host.invoke("demo-mcp.invalid", {}, { dataClass: "synthetic", permissionClass: "bounded-read", spendingClass: "deterministic" }), /mcp-tool-unavailable/);
});

test("MCP host rejects caller-supplied transports and undeclared capabilities", async () => {
  const host = manager();
  await assert.rejects(() => host.refresh({ endpoint: "https://caller.example" }), /caller-transport-forbidden/);
  await host.refresh();
  await assert.rejects(() => host.invoke("other.shell", {}, { dataClass: "synthetic", permissionClass: "bounded-read", spendingClass: "deterministic" }), /mcp-tool-unavailable/);
});
