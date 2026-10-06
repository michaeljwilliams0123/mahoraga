import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const commandCockpit = readFileSync(join(root, "components/cockpit/CommandCockpit.tsx"), "utf8");
const card = readFileSync(join(root, "components/cockpit/ProviderRenewalWatchdogCard.tsx"), "utf8");
const liveness = readFileSync(join(root, "lib/provider-admission-liveness.ts"), "utf8");
const renewalWorkflow = readFileSync(join(root, "..", ".github/workflows/cloudflare-provider-renewal.yml"), "utf8");
const deploymentWorkflow = readFileSync(join(root, "..", ".github/workflows/cloudflare-execution-runtime.yml"), "utf8");

describe("7.0.0-alpha.2 provider admission renewal cockpit", () => {
  it("surfaces isolated hard-zero renewal as observational telemetry, not deployment or traffic authority", () => {
    assert.match(cockpit, /ProviderRenewalWatchdogCard/);
    assert.match(cockpit, /Provider admission renewal/);
    assert.match(card, /Short fifteen-minute checks/);
    assert.match(card, /dedicated owner-dispatchable quarter-hour scheduled workflow/);
    assert.match(card, /one-shot exact-main check/);
    assert.match(card, /Deployment does not own scheduled renewal/);
    assert.match(card, /30-minute margin/);
    assert.match(card, /re-proves billing only when/);
    assert.match(card, /Access-protected requests/);
    assert.match(card, /Renewal never redeploys Workers/);
    assert.match(card, /observational only—not runtime readiness, production traffic authority, or traffic authority/);
    assert.match(card, /zero-route, zero-influence, zero-fallback, and zero-authority/);
    assert.match(cockpit, /dedicated owner-dispatchable quarter-hour workflow/);
    assert.match(cockpit, /deployment does not own scheduled renewal/);
    assert.match(cockpit, /never redeploys Workers/);
    assert.doesNotMatch(cockpit, /deployment publication stays serialized/i);
    assert.match(commandCockpit, /providerAdmissionRenewal/);
    assert.match(commandCockpit, /deployment does not own scheduled renewal/);
    assert.match(commandCockpit, /never redeploys Workers/);
    assert.match(liveness, /deployment does not own scheduled renewal/);
    assert.match(liveness, /Access-protected/);
    assert.match(liveness, /not production traffic authority/);
  });

  it("binds the UI claim to a quarter-hour owner-dispatchable exact-main workflow without Worker deployment", () => {
    assert.match(renewalWorkflow, /workflow_dispatch:/);
    assert.match(renewalWorkflow, /cron: "11,26,41,56 \* \* \* \*"/);
    assert.match(renewalWorkflow, /Renew hard-zero provider admission evidence/);
    assert.match(renewalWorkflow, /github\.ref == 'refs\/heads\/main'/);
    assert.match(renewalWorkflow, /Verify scheduled SHA is still authoritative main/);
    assert.match(renewalWorkflow, /RENEWAL_MARGIN_MS: 1800000/);
    assert.match(renewalWorkflow, /CLOUDFLARE_ACCESS_TOKEN/);
    assert.match(renewalWorkflow, /cf-access-client-id/);
    assert.match(renewalWorkflow, /cf-access-client-secret/);
    assert.match(renewalWorkflow, /Renew provider admission without deployment/);
    assert.doesNotMatch(renewalWorkflow, /wrangler\s+(?:deploy|versions upload)|cloudflare-execution-runtime\.ts deploy/i);
    assert.doesNotMatch(deploymentWorkflow, /^\s+schedule:/m);
  });

  it("keeps Mahoraga as product identity and 7.0.0-alpha.2 as provenance only", () => {
    assert.match(cockpit, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(cockpit, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(commandCockpit, /Mahoraga cloud cockpit/);
    assert.match(commandCockpit, /Build provenance is 7\.0\.0-alpha\.2/);
    for (const surface of [cockpit, commandCockpit, card]) {
      assert.doesNotMatch(surface, /<h[1-6][^>]*>7\.0\.0-alpha\.2/);
    }
  });
});
