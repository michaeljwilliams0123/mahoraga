import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startRuntime } from "../src/runtime.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PRIMARY_TOKEN = "expert-skills-primary-token-000000000000001";
const AUTH = { authorization: `Bearer ${PRIMARY_TOKEN}` };


test("Control Center exposes evidence-led expert methods and deterministic selection", async (t) => {
  const root = mkdtempSync(path.join(os.tmpdir(), "mahoraga-expert-control-"));
  const runtime = await startRuntime({ port: 0, databaseFile: path.join(root, "runtime.sqlite"), primaryCodexToken: PRIMARY_TOKEN, syncCoordinationMailbox: false });
  t.after(async () => { await runtime.stop(); rmSync(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${runtime.address.port}`;
  const status = await (await fetch(`${base}/api/status`)).json();
  assert.equal(status.expertSkills.length, 9);
  assert.ok(status.expertSkills.every((item) => item.credentialClaim === false));

  const response = await fetch(`${base}/api/expert-skills/select`, {
    method: "POST", headers: { ...AUTH, "content-type": "application/json" },
    body: JSON.stringify({
      prompt: "Review a SharePoint Visio flowchart for SOX risks and internal controls with evidence.",
      dataClass: "enterprise", limit: 3,
    }),
  });
  assert.equal(response.status, 200);
  const { selection } = await response.json();
  assert.equal(selection.matches[0].id, "internal-audit-cia");
  assert.equal(selection.enterprisePolicy.githubCoordinationContentAllowed, false);

  const html = readFileSync(path.join(ROOT, "web", "index.html"), "utf8");
  const app = readFileSync(path.join(ROOT, "web", "app.js"), "utf8");
  assert.match(html, /id="expert-skill-list"/);
  assert.match(app, /function renderExpertSkills\(\)/);
});
