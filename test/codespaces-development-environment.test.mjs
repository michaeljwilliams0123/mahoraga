import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const configPath = new URL("../.devcontainer/devcontainer.json", import.meta.url);
const guidePath = new URL("../docs/CODESPACES-DEVELOPMENT.md", import.meta.url);

test("optional Codespaces environment is development-only and non-deploying", async () => {
  const raw = await readFile(configPath, "utf8");
  const config = JSON.parse(raw);

  assert.equal(config.image, "mcr.microsoft.com/devcontainers/javascript-node:1-24-bookworm");
  assert.equal(config.remoteUser, "node");
  assert.equal(config.postCreateCommand, "npm ci");
  assert.equal(config.shutdownAction, "stopContainer");
  assert.deepEqual(config.forwardPorts, []);
  assert.equal(Object.hasOwn(config, "runArgs"), false);
  assert.equal(Object.hasOwn(config, "containerEnv"), false);
  assert.equal(Object.hasOwn(config, "remoteEnv"), false);

  const serialized = JSON.stringify(config).toLowerCase();
  for (const forbidden of ["wrangler", "deploy", "cloudflare_api", "railway", "gitlab", "sudo", "privileged"]){
    assert.equal(serialized.includes(forbidden), false, `unexpected Codespaces authority: ${forbidden}`);
  }
});

test("Codespaces guidance preserves billing and production authority boundaries", async () => {
  const guide = await readFile(guidePath, "utf8");
  assert.match(guide, /metered by GitHub/i);
  assert.match(guide, /does not claim unlimited or permanently free capacity/i);
  assert.match(guide, /starts no Mahoraga service/i);
  assert.match(guide, /GitLab remains read-only/i);
  assert.match(guide, /Railway remains non-routing/i);
  assert.match(guide, /GitHub-controlled Cloudflare deployment-and-acceptance workflow/i);
});
