import test from "node:test";
import assert from "node:assert/strict";
import { ambiguousTransportFailure, prepareChatRetry } from "../lib/command-retry.ts";
test("only uncertain transport status allows opt-in retry",()=>{
  for(const x of ["cloud-session-unreachable","relay-request-timeout","relay-disconnected","cloud-runtime-degraded","cloud-gateway-unavailable"])
    assert.equal(ambiguousTransportFailure(x),true);
  for(const x of ["cloud-owner-auth-required","github-native-unavailable","routing-changed","task-rejected","relay-not-paired",null])
    assert.equal(ambiguousTransportFailure(x),false);
});
test("manual retry preserves exact identity and conversation",()=>{
  const payload={idempotencyKey:"workspace-"+"a".repeat(8)+"-"+"b".repeat(4)+"-"+"c".repeat(4)+"-"+"d".repeat(4)+"-"+"e".repeat(12),
    conversationId:"conversation-1",text:"run /repo admin status",mode:"auto" as const,creditPolicy:"zero-codex" as const};
  const kept=prepareChatRetry(payload);
  assert.deepEqual(kept,payload);
  assert.equal(Object.isFrozen(kept),true);
  assert.throws(()=>prepareChatRetry({...payload,idempotencyKey:"workspace-new"}),/chat-retry-identity-invalid/);
});
