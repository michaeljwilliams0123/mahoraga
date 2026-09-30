import test from "node:test";
import assert from "node:assert/strict";
import { createOmnichannelEnvelope } from "../src/omnichannel-intake.mjs";
import { projectUniversalInteractionEnvelope } from "../src/universal-interaction-envelope.mjs";
import { negotiateInteractionProtocol } from "../src/interaction-protocol-negotiation.mjs";
import { createExecutionBroker } from "../deploy/cloudflare-execution-broker/worker.ts";
import { projectInteractionContext, projectInteractionRuntimeTruth } from "../deploy/cloudflare-execution-runtime/interaction-runtime.ts";
import { projectInteractionTruth } from "../cloud-app/lib/interaction-truth.ts";
import {
  createDeliveryState,
  markUniversalDeliveryDelivered,
  queueUniversalDelivery,
} from "../src/universal-delivery.mjs";

const NOW = "2026-09-30T00:20:00.000Z";
const NOW_MS = Date.parse(NOW);
const TASK_ID = "task-universal-reach-8";
const CHAIN_ID = "chain-universal-reach-8";
const CORRELATION_ID = "corr-universal-reach-8";
const IDEMPOTENCY_KEY = "owner:universal-reach:8";
const OUTPUT_REF = "artifact:universal-reach-final-8";
const AUTHORITY = ["repo:mahoraga:read", "codex:contained"];

function ingress() {
  return createOmnichannelEnvelope({
    source: "owner-request",
    actor: { actorType:"owner", actorId:"owner", trustClass:"owner-explicit", accountBoundary:"synthetic" },
    object: { surface:"control-center", requestId:"req-universal-reach-8", objectType:"request" },
    allowedActionClass: "observe",
    correlationId: CORRELATION_ID,
    idempotencyKey: IDEMPOTENCY_KEY,
    contentReferences: ["vault:12345678-1234-4234-8234-123456789abc"],
    routeHint: { capability:"repository.inspect", actionPackId:"universal-reach" },
    metadata: { channel:"owner" },
    zeroCreditEligible: true,
  }, { now:NOW, ttlSeconds:3600 });
}

function interaction() {
  const envelope = projectUniversalInteractionEnvelope(ingress(), {
    modalities:["text"],
    presentation:{ locale:"en-US", timeZone:"America/New_York", direction:"ltr", deviceClass:"phone", networkClass:"degraded" },
    delivery:{ supportsStreaming:true, supportsMarkdown:true, supportsRichText:true, supportsImages:false, supportsAudio:false, supportsVideo:false, supportsFiles:false, maxOutputBytes:4096 },
    protocol:{ family:"http-json", version:"1.0", schemaIds:["mahoraga.interaction.v1"] },
    requestedCapability:"repository.inspect",
  }, { now:NOW });
  const negotiationReceipt = negotiateInteractionProtocol(envelope, [{
    adapterId:"trusted-http-json",
    family:"http-json",
    versions:["1.0"],
    schemaIds:["mahoraga.interaction.v1"],
    modalities:["text"],
    maxPayloadBytes:8192,
  }], { now:NOW, payloadBytes:512 });
  return { envelope, negotiationReceipt };
}

const capability = (capability, permissionClass, authorityScopes) => ({
  capability,
  permissionClass,
  healthy:true,
  zeroCreditEligible:true,
  costClass:"zero-credit",
  dataClassesAllowed:["synthetic"],
  authorityScopes,
});

function attestation(provider, workerId, locality, capabilities) {
  return {
    schemaVersion:1,
    kind:"universal-worker-attestation",
    provider,
    workerId,
    locality,
    observedAt:new Date(NOW_MS - 1_000).toISOString(),
    expiresAt:new Date(NOW_MS + 60_000).toISOString(),
    observedLatencyMs:5,
    queueDepth:0,
    reliabilityScore:1,
    interactionSupport:{ modalities:["text"], protocolFamilies:["http-json"], locales:["en-US"] },
    capabilities,
  };
}

function binding(attestation, execute) {
  return {
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/api/capabilities") return Response.json(attestation);
      if (path === "/api/execute") return Response.json(await execute(await request.json()));
      return new Response("not found", { status:404 });
    },
  };
}

function nextHandoff(lease, requiredNextCapability, requestedPermission, hopCount, authorityScopes) {
  return {
    status:"handoff",
    handoff:{
      schemaVersion:1,
      taskId:lease.taskId,
      chainId:lease.chainId,
      fromWorkerId:lease.workerId,
      requiredNextCapability,
      requestedPermission,
      authorityScopes,
      evidenceRefs:[`evidence-${hopCount}`],
      hopCount,
    },
  };
}

test("universal reach preserves one bounded execution lineage through offline delivery and reconnect without re-execution", async () => {
  const { envelope, negotiationReceipt } = interaction();
  const interactionContext = projectInteractionContext(envelope, negotiationReceipt, { now:NOW });
  assert.equal(envelope.correlationId, CORRELATION_ID);
  assert.equal(envelope.presentation.deviceClass, "phone");
  assert.equal(envelope.presentation.networkClass, "degraded");
  assert.equal(negotiationReceipt.status, "accepted");

  const executions = { repositoryInspect:0, codex:0, repositoryVerify:0 };
  const repository = binding(attestation("github", "github-worker", "cloud", [
    capability("repository.inspect", "read", ["repo:mahoraga:read"]),
    capability("repository.verify", "read", ["repo:mahoraga:read"]),
  ]), ({ lease }) => {
    if (lease.capability === "repository.inspect") {
      executions.repositoryInspect += 1;
      return nextHandoff(lease, "codex.execute", "contained", 1, AUTHORITY);
    }
    executions.repositoryVerify += 1;
    return { status:"complete", receipt:{ id:"verified-final-output", capability:lease.capability, outputReference:OUTPUT_REF } };
  });
  const codex = binding(attestation("codex", "codex-worker", "local", [
    capability("codex.execute", "contained", ["codex:contained"]),
  ]), ({ lease }) => {
    executions.codex += 1;
    return nextHandoff(lease, "repository.verify", "read", 2, ["repo:mahoraga:read"]);
  });

  const broker = createExecutionBroker({ REPOSITORY_PROVIDER:repository, CODEX_PROVIDER:codex }, () => NOW_MS);
  const response = await broker.fetch(new Request("https://broker/api/execute", {
    method:"POST",
    headers:{ "content-type":"application/json" },
    body:JSON.stringify({
      request:{
        schemaVersion:1,
        taskId:TASK_ID,
        chainId:CHAIN_ID,
        requiredCapability:"repository.inspect",
        requestedPermission:"read",
        authorityPermission:"contained",
        dataClass:"synthetic",
        authorityScopes:AUTHORITY,
        costPreference:"zero-credit-first",
        maxHops:4,
        constraints:{ requireZeroCredit:true },
        evidenceRefs:[],
        interactionContext,
      },
      payload:{ objective:"inspect, contained codex execute, verify" },
    }),
  }));

  assert.equal(response.status, 200);
  const execution = await response.json();
  assert.equal(execution.status, "complete");
  assert.equal(execution.taskId, TASK_ID);
  assert.equal(execution.chainId, CHAIN_ID);
  assert.equal(execution.handoffCount, 2);
  assert.deepEqual(executions, { repositoryInspect:1, codex:1, repositoryVerify:1 });
  assert.equal(execution.receipts.filter((receipt) => receipt.kind === "handoff-receipt").length, 2);
  assert.equal(execution.receipts.at(-1).providerReceipt.outputReference, OUTPUT_REF);

  const offline = queueUniversalDelivery(createDeliveryState({
    interactionId:envelope.interactionId,
    taskId:TASK_ID,
    chainId:CHAIN_ID,
    idempotencyKey:IDEMPOTENCY_KEY,
    outputReferences:[OUTPUT_REF],
    channelFamily:"http-json",
  }, { now:NOW }), "offline", { now:"2026-09-30T00:20:05.000Z" });

  const queuedTruth = projectInteractionRuntimeTruth({
    envelope,
    negotiationReceipt,
    execution,
    deliveryState:offline,
  }, { now:"2026-09-30T00:20:05.000Z" });
  assert.equal(queuedTruth.interactionTruth.executionStatus, "completed");
  assert.equal(queuedTruth.deliveryTruth.status, "queued");
  assert.deepEqual(queuedTruth.deliveryTruth.outputReferences, [OUTPUT_REF]);

  // Model the runtime's persisted interaction-truth readback boundary used by a
  // reconnecting client. The reconnect path can read or redeliver the stored
  // receipt chain, but it has no broker/provider execution handle. The actual
  // Cloudflare native-bridge readback is separately pinned by the runtime integration suite.
  const persistedTruth = new Map([[envelope.interactionId, queuedTruth]]);
  const reconnectRead = (surface) => {
    assert.ok(["desktop", "headless"].includes(surface));
    const truth = persistedTruth.get(envelope.interactionId);
    assert.ok(truth);
    return { surface, truth };
  };

  const desktopQueued = reconnectRead("desktop");
  assert.equal(desktopQueued.truth.deliveryTruth.status, "queued");
  assert.deepEqual(executions, { repositoryInspect:1, codex:1, repositoryVerify:1 });

  const delivered = markUniversalDeliveryDelivered(offline, { now:"2026-09-30T00:21:00.000Z" });
  const deliveredAgain = markUniversalDeliveryDelivered(delivered, { now:"2026-09-30T00:22:00.000Z" });
  assert.deepEqual(deliveredAgain, delivered);

  const deliveredTruth = projectInteractionRuntimeTruth({
    envelope,
    negotiationReceipt,
    execution,
    deliveryState:deliveredAgain,
  }, { now:"2026-09-30T00:22:00.000Z" });
  persistedTruth.set(envelope.interactionId, deliveredTruth);

  for (const surface of ["desktop", "headless"]) {
    const reconnected = reconnectRead(surface);
    const projected = projectInteractionTruth({
      interaction: reconnected.truth.interactionTruth,
      delivery: reconnected.truth.deliveryTruth,
    });
    assert.equal(projected.state, "observed");
    assert.equal(projected.interaction.interactionId, envelope.interactionId);
    assert.equal(projected.interaction.deviceClass, "phone");
    assert.equal(projected.delivery.status, "delivered");
    assert.equal(projected.delivery.taskId, TASK_ID);
    assert.equal(projected.delivery.chainId, CHAIN_ID);
    assert.deepEqual(projected.delivery.outputReferences, [OUTPUT_REF]);
  }
  assert.deepEqual(executions, { repositoryInspect:1, codex:1, repositoryVerify:1 });

  assert.equal(deliveredTruth.deliveryTruth.status, "delivered");
  assert.deepEqual(deliveredTruth.deliveryTruth.outputReferences, [OUTPUT_REF]);
  assert.equal(deliveredTruth.deliveryTruth.taskId, TASK_ID);
  assert.equal(deliveredTruth.deliveryTruth.chainId, CHAIN_ID);

  const serialized = JSON.stringify({ execution, queuedTruth, deliveredTruth });
  assert.doesNotMatch(serialized, /trafficAuthority|railway|vercel|providerCredential|authorization|api[_-]?key/i);
  assert.equal(envelope.zeroCreditEligible, true);
  assert.equal(Object.hasOwn(deliveredTruth.interactionTruth, "trafficAuthority"), false);
  assert.equal(Object.hasOwn(deliveredTruth.deliveryTruth, "trafficAuthority"), false);
});
