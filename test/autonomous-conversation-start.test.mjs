import test from "node:test";
import assert from "node:assert/strict";
import { createAutonomousConversation } from "../src/autonomy-orchestrator.mjs";

test("a first conversational request creates the conversation and one autonomous objective", () => {
  const calls = [];
  const database = {
    createConversation(input) { calls.push(["conversation", input]); return { id: "con-1", title: input.title }; },
    listConversationMessages() { return [{ id: "msg-1", role: "user", content: "Improve the routing logic." }]; },
    createObjective(input) { calls.push(["objective", input]); return { id: "obj-1", ...input }; },
  };
  const result = createAutonomousConversation({
    database,
    policy: { conversationActivation: true },
    title: "Routing",
    initialMessage: "Improve the routing logic.",
    requiresResponse: true,
  });
  assert.equal(result.conversation.id, "con-1");
  assert.equal(result.objective.id, "obj-1");
  assert.deepEqual(calls.map(([kind]) => kind), ["conversation", "objective"]);
});

test("a journal-style first message can explicitly remain message-only", () => {
  let objectives = 0;
  const database = {
    createConversation: (input) => ({ id: "con-1", title: input.title }),
    listConversationMessages: () => [{ id: "msg-1", role: "user", content: "Remember this." }],
    createObjective: () => { objectives += 1; },
  };
  const result = createAutonomousConversation({ database, policy: { conversationActivation: true }, title: "Notes", initialMessage: "Remember this.", requiresResponse: false });
  assert.equal(result.objective, null);
  assert.equal(objectives, 0);
});
