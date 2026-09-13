import test from "node:test";
import assert from "node:assert/strict";
import { planConversationCapabilities } from "../src/conversation-capability-planner.mjs";

function route(capability, overrides = {}) {
  return {
    capability, workerId: capability.replace(/\./g, "-"), enabled: true, routable: true,
    dataClasses: capability.startsWith("m365.") ? ["enterprise"] : ["synthetic", "personal", "local-only"],
    costClass: "deterministic", economicTier: 0, routingReason: null,
    ...overrides,
  };
}

const ROUTES = [
  route("assistant.respond", { costClass: "licensed-cloud", economicTier: 3 }),
  route("repository.inspect"), route("repository.verify"),
  route("m365.reason", { costClass: "licensed-cloud", economicTier: 3 }),
  route("codex.execute", { costClass: "licensed-cloud", economicTier: 3 }),
];

test("free-form conversation uses an available answer capability instead of unsupported", () => {
  const plan = planConversationCapabilities({ content: "status?", capabilityRoutes: ROUTES });
  assert.equal(plan.execution, "task");
  assert.equal(plan.capability, "assistant.respond");
  assert.deepEqual(plan.capabilityPlan, ["assistant.respond"]);
});

test("natural Microsoft 365 language selects enterprise reasoning without requiring a URL", () => {
  const plan = planConversationCapabilities({ content: "Compare this with my Microsoft 365 work and tell me what changed.", capabilityRoutes: ROUTES });
  assert.equal(plan.execution, "task");
  assert.equal(plan.capability, "m365.reason");
  assert.equal(plan.reasonCode, "ucf-microsoft-context");
});

test("enterprise contextual follow-up stays on the enterprise reasoning lane", () => {
  const plan = planConversationCapabilities({
    content: "Summarize the above and give me the next action.", capabilityRoutes: ROUTES,
    priorTasks: [{ capability: "m365.reason", dataClass: "enterprise" }],
  });
  assert.equal(plan.execution, "task");
  assert.equal(plan.capability, "m365.reason");
  assert.equal(plan.reasonCode, "ucf-enterprise-follow-up");
});

test("multi-domain read work composes existing capabilities instead of forcing a builder", () => {
  const plan = planConversationCapabilities({
    content: "Review the repo and compare it with my Microsoft 365 work.", capabilityRoutes: ROUTES,
  });
  assert.equal(plan.execution, "objective");
  assert.deepEqual(plan.capabilityPlan, ["repository.inspect", "m365.reason"]);
});

test("repository mutation uses one builder stage plus verification instead of four builder stages", () => {
  const plan = planConversationCapabilities({
    content: "Review the repo, fix the highest-impact issue, and verify it.", capabilityRoutes: ROUTES,
  });
  assert.equal(plan.execution, "objective");
  assert.deepEqual(plan.capabilityPlan, ["repository.inspect", "codex.execute", "repository.verify"]);
});

test("broad human-recipient messaging is blocked before autonomous escalation", () => {
  const plan = planConversationCapabilities({
    content: "Send a message to everyone in Teams and ping the whole department.", capabilityRoutes: ROUTES,
  });
  assert.equal(plan.execution, "unavailable");
  assert.equal(plan.reasonCode, "recipient-not-authorized");
  assert.deepEqual(plan.capabilityPlan, []);
});

test("temporarily stale but enabled capability remains plannable so router recovery can act", () => {
  const routes = ROUTES.map((item) => item.capability === "m365.reason"
    ? { ...item, routable: false, routingReason: "canary-stale" }
    : item);
  const plan = planConversationCapabilities({ content: "Summarize my Microsoft 365 work.", capabilityRoutes: routes });
  assert.equal(plan.capability, "m365.reason");
  assert.equal(plan.recoverableRoute, true);
});


test("provider-unknown startup route stays plannable for bounded readiness recovery", () => {
  const plan = planConversationCapabilities({
    content: "Summarize my Microsoft 365 work",
    capabilityRoutes: [{ capability: "m365.reason", workerId: "microsoft365", enabled: true, routable: false, routingReason: "provider-unknown", dataClasses: ["enterprise"], economicTier: 3 }],
  });
  assert.equal(plan.execution, "task");
  assert.equal(plan.capability, "m365.reason");
  assert.equal(plan.recoverableRoute, true);
});

test("process-starting route remains plannable for startup recovery", () => {
  const plan = planConversationCapabilities({
    content: "Summarize my Microsoft 365 work",
    capabilityRoutes: [route("m365.reason", { routable: false, routingReason: "process-starting", dataClasses: ["enterprise"] })],
  });
  assert.equal(plan.execution, "task");
  assert.equal(plan.capability, "m365.reason");
  assert.equal(plan.recoverableRoute, true);
});
