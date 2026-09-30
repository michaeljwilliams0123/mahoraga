import test from "node:test";
import assert from "node:assert/strict";
import { createOmnichannelEnvelope } from "../src/omnichannel-intake.mjs";
import { projectUniversalInteractionEnvelope } from "../src/universal-interaction-envelope.mjs";
import { negotiateInteractionProtocol } from "../src/interaction-protocol-negotiation.mjs";

const NOW = "2026-09-29T22:45:00.000Z";

function fixture() {
  const ingress = createOmnichannelEnvelope({
    source:"owner-request", actor:{ actorType:"owner", actorId:"owner", trustClass:"owner-explicit", accountBoundary:"synthetic" },
    object:{ surface:"control-center", requestId:"runtime-integrity-1", objectType:"request" }, allowedActionClass:"observe",
    correlationId:"corr-runtime-integrity-1", idempotencyKey:"interaction:runtime-integrity-1",
    contentReferences:["vault:12345678-1234-4234-8234-123456789abc"], routeHint:{ capability:"repository.inspect", actionPackId:"runtime-integrity" }, metadata:{ channel:"owner" }, zeroCreditEligible:true,
  }, { now:NOW, ttlSeconds:3600 });
  const envelope = projectUniversalInteractionEnvelope(ingress, {
    modalities:["text"], presentation:{ locale:"en-US", deviceClass:"desktop", networkClass:"online" },
    delivery:{ supportsStreaming:false, supportsMarkdown:true, supportsRichText:false, supportsImages:false, supportsAudio:false, supportsVideo:false, supportsFiles:false, maxOutputBytes:4096 },
    protocol:{ family:"http-json", version:"1.0", schemaIds:["mahoraga.interaction.v1"] }, requestedCapability:"repository.inspect",
  }, { now:NOW });
  const adapter = { adapterId:"trusted-http-json", family:"http-json", versions:["1.0"], schemaIds:["mahoraga.interaction.v1"], modalities:["text"], maxPayloadBytes:8192 };
  return { envelope, accepted:negotiateInteractionProtocol(envelope, [adapter], { now:NOW }) };
}

test("runtime truth wrapper is content-bound before persisted readback", async () => {
  const runtime = await import("../deploy/cloudflare-execution-runtime/interaction-runtime.ts");
  const { envelope, accepted } = fixture();
  const truth = runtime.projectInteractionRuntimeTruth({
    envelope, negotiationReceipt:accepted,
    execution:{ status:"complete", taskId:"task-integrity", chainId:"chain-integrity", handoffCount:0, receipts:[] },
  }, { now:"2026-09-29T22:46:00.000Z" });

  assert.match(truth.runtimeTruthFingerprint, /^[a-f0-9]{64}$/);
  assert.deepEqual(runtime.validateInteractionRuntimeTruth(truth), truth);

  const tampered = {
    ...truth,
    interactionTruth:{ ...truth.interactionTruth, executionFingerprint:"f".repeat(64) },
  };
  assert.throws(
    () => runtime.validateInteractionRuntimeTruth(tampered),
    /interaction-runtime-truth-fingerprint-invalid/,
  );
});
