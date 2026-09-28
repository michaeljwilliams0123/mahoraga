import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateLifecycleDependencyBoundary } from "../scripts/lifecycle-dependency-policy.ts";

test("policy names forbidden provider and inference tokens with their path", async () => {
  const root = await mkdtemp(join(tmpdir(), "lifecycle-policy-"));
  try {
    await mkdir(join(root, "deploy/cloudflare-lifecycle-evaluation"), { recursive: true });
    await writeFile(join(root, "deploy/cloudflare-lifecycle-evaluation/worker.ts"), 'const bad = "https://api.railway.app"; const key = process.env.OPENAI_API_KEY;');
    const receipt = validateLifecycleDependencyBoundary(root);
    assert.equal(receipt.accepted, false);
    assert.ok(receipt.violations.some(v => v.path.endsWith("worker.ts") && v.reason === "excluded-provider"));
    assert.ok(receipt.violations.some(v => v.reason === "external-inference"));
    await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { "cloudflare:lifecycle:run": "npx vercel deploy" } }));
    const commands = validateLifecycleDependencyBoundary(root);
    assert.ok(commands.violations.some(v => v.path.startsWith("package.json") && v.reason === "excluded-provider"));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("policy rejects every forbidden top-level Wrangler binding", async () => {
  const root = await mkdtemp(join(tmpdir(), "lifecycle-binding-policy-"));
  try {
    const dir = join(root, "deploy/cloudflare-lifecycle-evaluation");
    await mkdir(dir, { recursive: true });
    for (const key of ["services", "queues", "vectorize", "browser", "ai", "r2_buckets", "d1_databases", "hyperdrive"]) {
      await writeFile(join(dir, "wrangler.jsonc"), JSON.stringify({ name: "lifecycle-test", [key]: [] }));
      const receipt = validateLifecycleDependencyBoundary(root);
      assert.equal(receipt.accepted, false, `expected ${key} to be rejected`);
      assert.ok(receipt.violations.some(v => v.path.endsWith("wrangler.jsonc") && v.reason === "unbounded-binding"), key);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("actual lifecycle boundary is credential-free outside explicit live Cloudflare inputs", () => {
  const receipt = validateLifecycleDependencyBoundary(process.cwd());
  assert.equal(receipt.accepted, true, JSON.stringify(receipt.violations));
  assert.match(receipt.fingerprint, /^[a-f0-9]{64}$/);
});
