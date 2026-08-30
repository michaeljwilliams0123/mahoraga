import test from "node:test";
import assert from "node:assert/strict";
import { buildAutonomyObjective, createAutonomousConversationTurn } from "../src/autonomy-orchestrator.mjs";

test("conversation autonomy builds two independent debate lanes before synthesis and implementation", () => {
  const objective = buildAutonomyObjective({
    conversationId: "con-00000000-0000-0000-0000-000000000000",
    messageId: "msg-00000000-0000-0000-0000-000000000000",
    message: "Upgrade the routing nodes and links, then verify the result.",
    requestedMode: "hybrid",
  });
  assert.equal(objective.correlationId, "aut-msg-00000000-0000-0000-0000-000000000000");
  assert.deepEqual(objective.tasks.map(({ id, dependsOn }) => ({ id, dependsOn })), [
    { id: "propose", dependsOn: [] },
    { id: "challenge", dependsOn: [] },
    { id: "synthesize", dependsOn: ["propose", "challenge"] },
    { id: "implement", dependsOn: ["synthesize"] },
    { id: "verify", dependsOn: ["implement"] },
    { id: "integrate", dependsOn: ["verify"] },
  ]);
  assert.equal(objective.tasks.filter((task) => task.capability === "codex.execute").length, 4);
  assert.equal(objective.tasks.find((task) => task.id === "integrate").completionCriteria, "merge-after-verify");
});

test("a response-requesting user turn persists once and creates one objective", () => {
  const calls = [];
  const database = {
    addConversationMessage(input) {
      calls.push(["message", input]);
      return { id: "msg-00000000-0000-0000-0000-000000000001", ...input };
    },
    createObjective(input) { calls.push(["objective", input]); return { id: "obj-1", ...input }; },
  };
  const result = createAutonomousConversationTurn({
    database,
    policy: { conversationActivation: true },
    conversationId: "con-00000000-0000-0000-0000-000000000000",
    content: "Build autonomy from this conversation.",
    requiresResponse: true,
  });
  assert.equal(result.message.id, "msg-00000000-0000-0000-0000-000000000001");
  assert.equal(result.objective.id, "obj-1");
  assert.deepEqual(calls.map(([kind]) => kind), ["message", "objective"]);
});

test("non-autonomous turns preserve existing message-only behavior", () => {
  let objectives = 0;
  const database = {
    addConversationMessage: (input) => ({ id: "msg-1", ...input }),
    createObjective: () => { objectives += 1; },
  };
  const result = createAutonomousConversationTurn({ database, policy: { conversationActivation: true }, conversationId: "con-1", content: "note", requiresResponse: false });
  assert.equal(result.objective, null);
  assert.equal(objectives, 0);
});
