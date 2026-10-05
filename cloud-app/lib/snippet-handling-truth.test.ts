import assert from "node:assert/strict";
import test from "node:test";
import { handlingLabel, sessionLane, stagedHandling } from "./snippet-handling-truth.ts";

test("text uploads are model-visible snippets and binaries stay opaque", () => {
  assert.equal(stagedHandling({ name: "notes.ts", type: "" }), "text-snippet");
  assert.equal(stagedHandling({ name: "scan.pdf", type: "application/pdf" }), "opaque-artifact");
  assert.match(handlingLabel("opaque-artifact"), /excluded from model context/);
});

test("session lane stays bounded and does not infer authority from connecting", () => {
  assert.equal(sessionLane({ coreReady: false, relayState: "resuming", ownerLoginRequired: false }), "connecting");
  assert.equal(sessionLane({ coreReady: false, relayState: "unpaired", ownerLoginRequired: true }), "access-required");
  assert.equal(sessionLane({ coreReady: true, relayState: "connected", ownerLoginRequired: false }), "authenticated");
});
