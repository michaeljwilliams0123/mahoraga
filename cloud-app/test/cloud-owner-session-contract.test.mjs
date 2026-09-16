import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (file) => readFile(new URL(file, root), "utf8");

test("an unauthenticated cloud browser asks for owner auth before assertion-secret lookup", async () => {
  const gateway = await read("lib/cloud-owner-gateway.ts");
  const owner = gateway.indexOf("const assertedOwner =");
  const guard = gateway.indexOf("const hasSignedAssertion =");
  const secret = gateway.indexOf('const assertionSecret = required("MAHORAGA_CLOUD_OWNER_ASSERTION_SECRET")');
  assert.ok(owner >= 0);
  assert.ok(guard > owner, "signed-assertion presence must be evaluated after reading headers");
  assert.ok(secret > guard, "assertion secret must not be required for a browser with no assertion");
  assert.match(gateway.slice(guard, secret), /cloud-owner-auth-required/);
});

test("routine chat does not present relay pairing as the normal connection path", async () => {
  const chat = await read("components/workspace/chat-view.tsx");
  assert.doesNotMatch(chat, /<strong>Connect the Mahoraga brain<\/strong>/);
  assert.match(chat, /Cloud connection unavailable/);
  assert.match(chat, /Recovery connection/);
  assert.match(chat, /Paste pairing offer/);
});
