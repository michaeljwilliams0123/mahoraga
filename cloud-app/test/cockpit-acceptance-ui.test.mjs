import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cockpit = readFileSync(join(root, "components/cockpit/CockpitView.tsx"), "utf8");
const types = readFileSync(join(root, "components/workspace/workspace-types.ts"), "utf8");

describe("7.0.0-alpha.2 cockpit Cloudflare acceptance evidence", () => {
  it("gates cognition and no-Railway-fallback on sanitized receipt fields only", () => {
    assert.match(cockpit, /const cognitionObserved = acceptance\.providerCognitionVerified === true;/);
    assert.match(cockpit, /const noRailwayVerified = acceptance\.noRailwayFallbackVerified === true;/);
    assert.match(cockpit, /projectAcceptanceEvidence\(bypassApplied/);
    assert.match(cockpit, /expectedSha: health\?\.deployment\?\.expectedCommitSha/);
    assert.match(cockpit, /deploymentSha: health\?\.deployment\?\.commitSha/);
    assert.match(cockpit, /Cloudflare cognition/);
    assert.match(cockpit, /No Railway fallback/);
    assert.match(cockpit, /Observed/);
    assert.match(cockpit, /Unverified/);
    assert.match(cockpit, /Unproven/);
    assert.match(cockpit, /zero-route \/ zero-influence \/ zero-fallback \/ zero-authority/);
    assert.doesNotMatch(cockpit, /rollback\/evidence|rollback anchor/i);
    assert.match(cockpit, /x-bypass-applied/);
    assert.match(cockpit, /never inferred from \/api\/ready/i);
  });

  it("keeps traffic authority separate and never flips it from ready or acceptance", () => {
    assert.match(cockpit, /Traffic authority/);
    assert.match(cockpit, /Separate \/ unverified/);
    assert.match(cockpit, /Never inferred from \/api\/ready/);
    assert.match(cockpit, /trafficAuthorityVerified/);
    assert.doesNotMatch(cockpit, /readyOk \? "Canonical traffic"/);
  });

  it("surfaces provider admission restoration retry as bounded observational evidence", () => {
    assert.match(cockpit, /Provider admission restore retry/);
    assert.match(cockpit, /Provider restoration retry/);
    assert.match(cockpit, /Retry only transient 503 responses/);
    assert.match(cockpit, /same verified hard-zero billing attestation/);
    assert.match(cockpit, /bounded attempts and validated delay/);
    assert.match(cockpit, /persistent failure remains fail-closed/);
    assert.match(cockpit, /accept-provider-restore-503 is not traffic authority/);
    assert.match(cockpit, /Observational \/ fail-closed/);
  });

  it("surfaces the optional Codespaces environment without granting authority", () => {
    assert.match(cockpit, /Codespaces development environment/);
    assert.match(cockpit, /Optional \/ non-authoritative/);
    assert.match(cockpit, /Node 24 developer convenience from #812/);
    assert.match(cockpit, /locked dependencies only/);
    assert.match(cockpit, /exposes no ports/);
    assert.match(cockpit, /starts no Mahoraga service/);
    assert.match(cockpit, /GitHub metering and quota apply/);
    assert.match(cockpit, /GitHub and Cloudflare remain production authority/);
    assert.match(cockpit, /GitLab read-only/);
    assert.match(cockpit, /Railway non-routing/);
    assert.match(cockpit, /not a production host, inference provider, lifecycle automation, self-patching authority, deployment lane, or routing change/);
    assert.match(cockpit, /supplies no production authentication material/);
  });

  it("keeps product Mahoraga and 7.0.0-alpha.2 as provenance only", () => {
    assert.match(cockpit, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(cockpit, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(types, /SanitizedAcceptanceReceipt/);
    assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
  });

  it("surfaces uploaded snippet completeness as observational only", () => {
    assert.match(cockpit, /Uploaded snippet completeness/);
    assert.match(cockpit, /Envelope ignored \(observational\)/);
    assert.match(cockpit, /workspace-injected uploaded snippet envelopes/);
    assert.match(cockpit, /Numbered source content in a staged snippet is not an incomplete multi-scenario answer/);
    assert.match(cockpit, /Incomplete detection still applies to the actual user prompt/);
    assert.match(cockpit, /Merged #986/);
    assert.match(cockpit, /Not execution authority, not cognition proof, and not traffic authority/);
    assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
  });

  it("surfaces the hard-zero quota decision without implying promotion", () => {
    assert.match(types, /HardZeroQuotaReceipt/);
    assert.match(types, /quota-hold-until-utc-reset/);
    assert.match(types, /dispatch-hard-zero/);
    assert.match(types, /resume-queued/);
    assert.match(types, /refuse-paid-route/);
    assert.match(cockpit, /Hard-zero quota route/);
    assert.match(cockpit, /Next UTC reset/);
    assert.match(cockpit, /Same idempotency key/);
    assert.match(cockpit, /creditCost/);
    assert.match(cockpit, /paidFallback/);
    assert.match(cockpit, /Hold until UTC reset/);
    assert.match(cockpit, /Resume queued/);
    assert.match(cockpit, /Refuse paid route/);
    assert.match(cockpit, /Dispatch hard-zero/);
    assert.match(cockpit, /does not grant traffic authority/);
    assert.match(types, /heldUtcDay/);
    assert.match(types, /heldResumeAt/);
    assert.match(cockpit, /projectHardZeroHold/);
    assert.match(cockpit, /Hold provenance/);
  });

  it("marks Vercel retired without granting gateway or traffic authority", () => {
    assert.match(cockpit, /Vercel retired/);
    assert.match(cockpit, /observation-only/);
    assert.match(cockpit, /Vercel status/);
    assert.doesNotMatch(cockpit, /mahoraga-cloud-workspace\.vercel\.app/);
  });

  it("surfaces the sovereign workflow zero-credit model URL boundary as observational only", () => {
    const card = readFileSync(join(root, "components/cockpit/ZeroCreditModelUrlBoundaryCard.tsx"), "utf8");
    assert.match(cockpit, /ZeroCreditModelUrlBoundaryCard/);
    assert.match(cockpit, /productName = health\?\.product \?\? "Mahoraga"/);
    assert.match(card, /MAHORAGA_ZERO_CREDIT_MODEL_URL/);
    assert.match(card, /clears the self-hosted runner/);
    assert.match(card, /cannot inherit the loopback zero-credit model endpoint/);
    assert.match(card, /fail-closed local-AI guard is unchanged/);
    assert.match(card, /Product remains Mahoraga/);
    assert.match(card, /7\.0\.0-alpha\.2 is build provenance only/);
    assert.match(card, /not execution readiness, not cognition proof, and not production traffic authority/);
    assert.match(card, /not a provider selection or traffic-authority claim/);
    assert.doesNotMatch(card, /https?:\/\/|127\.0\.0\.1|localhost/i);
    assert.doesNotMatch(card, /\bfetch\s*\(/);
  });

  it("surfaces cognitive admission provenance observational status for fixtures only", () => {
    assert.match(cockpit, /Cognitive admission provenance/);
    assert.match(cockpit, /Observational \/ fixtures only/);
    assert.match(cockpit, /expectedSourceCommit provenance \(40-hex SHA, state 'current'\)/);
    assert.match(cockpit, /Production remains fail-closed/);
    assert.match(cockpit, /does not grant traffic authority or change production admission logic/);
    assert.match(cockpit, /Product remains Mahoraga; 7\.0\.0-alpha\.2 is build provenance only/);
    assert.doesNotMatch(cockpit, /<h2>7\.0\.0-alpha\.2/);
  });
});

describe("unified Cloudflare static UI provenance is not runtime authority", () => {
  const staticCard = readFileSync(join(root, "components/cockpit/StaticWorkspaceParityCard.tsx"), "utf8");
  it("shows sole Owner Gateway with Pages as a non-authoritative mirror", () => {
    assert.match(cockpit, /StaticWorkspaceParityCard health=\{health\}/);
    assert.match(staticCard, /mahoraga-owner-gateway\.mahoraga-mjw0123\.workers\.dev/);
    assert.match(staticCard, /GitHub Pages is a source mirror/);
    assert.match(staticCard, /single owner-facing workspace/);
    assert.doesNotMatch(staticCard, /Railway.*execution origin|Vercel.*execution origin/);
  });
  it("fails closed on source manifest and independent runtime claims", () => {
    assert.match(staticCard, /deployment\?\.provider === "cloudflare-workers"/);
    assert.match(staticCard, /deployment\.environment === "candidate"/);
    assert.match(staticCard, /deployment\.gitRef === "main"/);
    assert.match(staticCard, /validSourceSha\(sourceSha\)/);
    assert.match(staticCard, /pairedRuntimeSourceVerified: false/);
    assert.match(staticCard, /executionAuthorityGranted: false/);
    assert.match(staticCard, /independent successful publication receipt/);
    assert.match(staticCard, /signed\s+creditsUsed evidence/);
    assert.match(staticCard, /traffic authority each require separate live proof/);
    assert.doesNotMatch(staticCard, /executionAuthorityGranted: true|pairedRuntimeSourceVerified: true/);
  });
});
