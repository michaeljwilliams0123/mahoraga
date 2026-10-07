import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(import.meta.dirname, "..");

test("7.0.0-alpha.2 cockpit surfaces bounded exact-main convergence diagnostics", () => {
  const card = readFileSync(join(root, "components/cockpit/ExactMainConvergenceDiagnosticCard.tsx"), "utf8");
  const publication = readFileSync(join(root, "components/cockpit/PairedWorkspacePublicationCard.tsx"), "utf8");
  const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
  assert.match(card, /data-testid="exact-main-convergence-diagnostic"/);
  assert.match(card, /live-http-302-ready-http-503/);
  assert.match(card, /ready-sha-mismatch/);
  assert.match(card, /ready-durable-state-mismatch/);
  assert.match(card, /transport-or-payload-invalid/);
  assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
  assert.match(card, /Not execution readiness/);
  assert.doesNotMatch(card, /bearer|service token|private-secret/i);
  assert.match(publication, /ExactMainConvergenceDiagnosticCard/);
  assert.match(cockpit, /PairedWorkspacePublicationCard/);
  assert.match(publication, /Product remains Mahoraga/);
});
