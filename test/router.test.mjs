import test from "node:test";
import assert from "node:assert/strict";
import { loadManifest } from "../src/config.mjs";
import { routeTask } from "../src/router.mjs";

test("local deterministic work routes to an enabled isolated worker", async () => {
  const manifest = await loadManifest();
  const route = routeTask(manifest, { capability: "system.health", dataClass: "synthetic", requestedMode: "local" });
  assert.equal(route.status, "routable");
  assert.equal(route.worker.id, "local-core");
});

test("enterprise and unavailable capabilities wait without crossing boundaries", async () => {
  const manifest = await loadManifest();
  assert.deepEqual(routeTask(manifest, { capability: "m365.reason", dataClass: "enterprise", requestedMode: "local" }), {
    status: "waiting", reason: "no-enabled-worker", worker: null,
  });
  assert.equal(routeTask(manifest, { capability: "system.health", dataClass: "local-only", requestedMode: "maximum" }).status, "routable");
});

