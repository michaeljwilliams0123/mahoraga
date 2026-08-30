import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("secondary operations stack is loopback-only and rejects unpinned images and missing secrets", async () => {
  const compose = await readFile(new URL("../deploy/secondary-host/docker-compose.yml", import.meta.url), "utf8");
  assert.doesNotMatch(compose, /:latest\b/);
  assert.doesNotMatch(compose, /"(?:5678|6333|6334):(?:5678|6333|6334)"/);
  assert.match(compose, /127\.0\.0\.1:5678:5678/);
  assert.match(compose, /127\.0\.0\.1:6333:6333/);
  assert.match(compose, /N8N_IMAGE:\?set N8N_IMAGE/);
  assert.match(compose, /QDRANT_API_KEY:\?inject outside Git/);
  assert.match(compose, /internal: true/);
  assert.match(compose, /no-new-privileges:true/g);
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
