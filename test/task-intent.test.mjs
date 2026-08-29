import test from "node:test";
import assert from "node:assert/strict";

import { classifyTaskIntent, validateIntentDecision } from "../src/task-intent.mjs";

const caps = [
  "artifact.inspect", "m365.reason", "browser.targets", "browser.navigate",
  "browser.status", "browser.smoke", "update.scan", "system.capabilities.describe",
  "manifest.describe", "repository.inspect", "repair.scan", "system.health",
];

test("classifies supported task language into bounded registered routes", () => {
  const cases = [
    ["list browser targets", "browser-targets", "browser.targets"],
    ["navigate to YouTube", "browser-navigation", "browser.navigate"],
    ["run browser health smoke check", "browser-health", "browser.smoke"],
    ["scan for updates", "update-scan", "update.scan"],
    ["describe capabilities", "capability-describe", "system.capabilities.describe"],
    ["describe configuration", "configuration-describe", "manifest.describe"],
    ["inspect the repository", "repository-inspect", "repository.inspect"],
    ["repair the failed worker", "repair", "repair.scan"],
    ["check system health", "system-health", "system.health"],
  ];
  for (const [content, intentKind, capability] of cases) {
    const decision = classifyTaskIntent({ content, attachmentCount: 0, availableCapabilities: caps });
    assert.equal(decision.intentKind, intentKind, content);
    assert.equal(decision.capability, capability, content);
    assert.equal(Object.isFrozen(decision), true);
    assert.equal(Object.hasOwn(decision, "content"), false);
  }
});

test("preserves route precedence and only registers explicit YouTube navigation", () => {
  const attachment = classifyTaskIntent({ content: "inspect this URL https://example.com", attachmentCount: 1, availableCapabilities: caps });
  assert.equal(attachment.intentKind, "attachment");
  assert.equal(attachment.capability, "artifact.inspect");

  const microsoft = classifyTaskIntent({ content: "reason over https://contoso.sharepoint.com/sites/finance", attachmentCount: 0, availableCapabilities: caps });
  assert.equal(microsoft.intentKind, "microsoft-work");
  assert.equal(microsoft.capability, "m365.reason");

  const youtube = classifyTaskIntent({ content: "open https://www.youtube.com/watch?v=abc", attachmentCount: 0, availableCapabilities: caps });
  assert.equal(youtube.targetId, "public.youtube");
  assert.equal(youtube.capability, "browser.navigate");

  const unknown = classifyTaskIntent({ content: "open https://example.com", attachmentCount: 0, availableCapabilities: caps });
  assert.equal(unknown.intentKind, "unsupported");
  assert.equal(unknown.capability, null);
});

test("fails closed for arbitrary capabilities and raw-content mutation", () => {
  const decision = classifyTaskIntent({ content: "tell me a joke", attachmentCount: 0, availableCapabilities: ["arbitrary.command"] });
  assert.equal(decision.intentKind, "unsupported");
  assert.equal(decision.capability, null);
  assert.throws(() => validateIntentDecision({ ...decision, capability: "arbitrary.command" }));
  assert.throws(() => validateIntentDecision({ ...decision, content: "tell me a joke" }));
  assert.throws(() => validateIntentDecision({ ...decision, requiredEvidenceIds: ["C:\\secret\\prompt.txt"] }));
  assert.throws(() => decision.requiredEvidenceIds.push("mutated"));
});

test("target listing wins over navigation and plain Microsoft mentions do not route", () => {
  const mixed = classifyTaskIntent({ content: "list browser targets and navigate to YouTube", attachmentCount: 0, availableCapabilities: caps });
  assert.equal(mixed.intentKind, "browser-targets");
  const plain = classifyTaskIntent({ content: "tell me about Microsoft 365", attachmentCount: 0, availableCapabilities: caps });
  assert.equal(plain.intentKind, "unsupported");
});

test("selects browser smoke for explicit smoke wording and status for generic wording", () => {
  assert.equal(classifyTaskIntent({ content: "verify browser smoke", attachmentCount: 0, availableCapabilities: caps }).capability, "browser.smoke");
  assert.equal(classifyTaskIntent({ content: "check the browser", attachmentCount: 0, availableCapabilities: caps }).capability, "browser.status");
});

test("rejects grammar-valid but unregistered evidence and limitation identifiers", () => {
  const valid = classifyTaskIntent({ content: "list browser targets", attachmentCount: 0, availableCapabilities: caps });
  assert.throws(() => validateIntentDecision({ ...valid, requiredEvidenceIds: ["made-up-evidence"] }));
  assert.throws(() => validateIntentDecision({ ...valid, limitations: ["made-up-limitation"] }));
});
test("recognizes only parsed HTTPS Microsoft-work hosts", () => {
  const valid = ["https://tenant.sharepoint.com/sites/a", "https://teams.microsoft.com/l/team", "https://onedrive.live.com/?id=1", "https://tenant.crm.dynamics.com/main.aspx", "https://tenant.crm3.dynamics.com/main.aspx"];
  for (const content of valid) assert.equal(classifyTaskIntent({ content, attachmentCount: 0, availableCapabilities: caps }).intentKind, "microsoft-work", content);
  const hostile = ["https://tenant.sharepoint.com.evil.example/x", "https://tenant.sharepoint.com@evil.example/x", "https://evil.example/?next=tenant.sharepoint.com", "https://evil.example/tenant.sharepoint.com", "http://tenant.sharepoint.com/sites/a", "https://www.dynamics.com/x", "https://foo.dynamics.com/x"];
  for (const content of hostile) assert.notEqual(classifyTaskIntent({ content: `open ${content}`, attachmentCount: 0, availableCapabilities: caps }).intentKind, "microsoft-work", content);
  assert.equal(classifyTaskIntent({ content: "verify browser test", attachmentCount: 0, availableCapabilities: caps }).capability, "browser.smoke");
});