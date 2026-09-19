import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const moduleUrl = new URL("../lib/api-origin.ts", import.meta.url);

async function loadApiOriginModule() {
  try {
    await readFile(moduleUrl, "utf8");
  } catch {
    assert.fail("api-origin helper must exist");
  }
  return import(`${moduleUrl.href}?test=${Date.now()}`);
}

test("API origin accepts only bare HTTPS origins", async () => {
  const { mahoragaApiOrigin } = await loadApiOriginModule();
  const accepted = [
    ["https://api.example.test", "https://api.example.test"],
    ["https://api.example.test/", "https://api.example.test"],
  ];
  for (const [value, expected] of accepted) assert.equal(mahoragaApiOrigin(value), expected);

  const rejected = [
    "http://api.example.test",
    "javascript:alert(1)",
    "https://user:pass@api.example.test",
    "https://api.example.test/path",
    "https://api.example.test/?q=1",
    "https://api.example.test/#fragment",
  ];
  for (const value of rejected) assert.throws(() => mahoragaApiOrigin(value), /mahoraga-api-origin-invalid/);
  assert.equal(mahoragaApiOrigin(""), null);
});

test("API URL builder accepts only absolute pathnames and never invents an origin", async () => {
  const { mahoragaApiUrl } = await loadApiOriginModule();
  assert.equal(mahoragaApiUrl("/api/runtime/session", "https://api.example.test"), "https://api.example.test/api/runtime/session");
  assert.throws(() => mahoragaApiUrl("api/runtime/session", "https://api.example.test"), /mahoraga-api-path-invalid/);
  assert.throws(() => mahoragaApiUrl("//evil.example/", "https://api.example.test"), /mahoraga-api-path-invalid/);
  assert.throws(() => mahoragaApiUrl("https://evil.example/", "https://api.example.test"), /mahoraga-api-path-invalid/);
  assert.throws(() => mahoragaApiUrl("/api/runtime/session", ""), /mahoraga-api-origin-unconfigured/);
});
