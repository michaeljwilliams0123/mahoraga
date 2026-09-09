import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("secondary operations stack is loopback-only and rejects unpinned images and missing secrets", async () => {
  const compose = await readFile(new URL("../deploy/secondary-host/docker-compose.yml", import.meta.url), "utf8");
  assert.doesNotMatch(compose, /:latest\b/);
  assert.doesNotMatch(compose, /"(?:5678|6333|6334):(?:5678|6333|6334)"/);
  assert.match(compose, /\$\{N8N_BIND_HOST:-127\.0\.0\.1\}:\$\{N8N_PORT:-5678\}:5678/);
  assert.match(compose, /\$\{QDRANT_BIND_HOST:-127\.0\.0\.1\}:6333:6333/);
  assert.match(compose, /N8N_IMAGE:\?set N8N_IMAGE/);
  assert.match(compose, /QDRANT_API_KEY:\?inject outside Git/);
  assert.match(compose, /internal: true/);
  assert.match(compose, /no-new-privileges:true/g);
});

test("secondary operations compose uses startup conditions, health checks, and ollama profiles", async () => {
  const compose = await readFile(new URL("../deploy/secondary-host/docker-compose.yml", import.meta.url), "utf8");
  assert.match(compose, /condition: service_healthy/);
  assert.match(compose, /condition: service_completed_successfully/);
  assert.match(compose, /healthcheck:/);
  assert.match(compose, /ollama-cpu:/);
  assert.match(compose, /ollama-gpu-nvidia:/);
  assert.match(compose, /ollama-gpu-amd:/);
  assert.match(compose, /ollama pull "\$\{OLLAMA_MODEL:-llama3\.2\}"/);
  assert.match(compose, /host\.docker\.internal:host-gateway/);
});

test("secondary operations env example documents required profile and secret settings", async () => {
  const envExample = await readFile(new URL("../deploy/secondary-host/.env.example", import.meta.url), "utf8");
  assert.match(envExample, /^N8N_IMAGE=/m);
  assert.match(envExample, /^QDRANT_IMAGE=/m);
  assert.match(envExample, /^MCP_GATEWAY_IMAGE=/m);
  assert.match(envExample, /^OLLAMA_IMAGE=/m);
  assert.match(envExample, /^N8N_ENCRYPTION_KEY=/m);
  assert.match(envExample, /^QDRANT_API_KEY=/m);
  assert.match(envExample, /--profile cpu up -d/);
  assert.match(envExample, /--profile gpu-nvidia up -d/);
  assert.match(envExample, /--profile gpu-amd up -d/);
});

test("cloud operations preserve the protected-device and approval boundaries", async () => {
  const operations = await readFile(new URL("../docs/CLOUD-AUTONOMY-OPERATIONS.md", import.meta.url), "utf8");
  const protocol = await readFile(new URL("../docs/AGENT-EXECUTION-PROTOCOL.md", import.meta.url), "utf8");
  assert.match(operations, /current primary device is immutable/i);
  assert.match(operations, /no local Chrome extension/i);
  assert.match(protocol, /never expose chain-of-thought/i);
  assert.match(protocol, /require attended human approval/i);
  assert.match(protocol, /Stop after two equivalent failures/i);
  assert.match(protocol, /Store no credentials, chats, personal files/i);
});
