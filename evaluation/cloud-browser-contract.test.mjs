import test from "node:test";
import assert from "node:assert/strict";
import { validateCloudBrowserConnection } from "./cloud-browser-contract.mjs";

const safe = Object.freeze({
  provider: "openai-computer-use",
  executionPlane: "cloud",
  isolated: true,
  extensionsEnabled: false,
  localFileAccess: false,
  domains: ["example.com", "github.com"],
  humanApproval: ["purchase", "submit", "delete", "permission-change", "credential-entry"],
});

test("isolated cloud browser requires no local extension or device mutation", () => {
  assert.deepEqual(validateCloudBrowserConnection(safe), {
    ready: true, provider: "openai-computer-use", executionPlane: "cloud", domainCount: 2,
    localExtensionRequired: false, localDeviceMutationAllowed: false, pageContentTrusted: false,
  });
});

test("unsafe browser connections fail closed", () => {
  assert.throws(() => validateCloudBrowserConnection({ ...safe, executionPlane: "local" }), /isolation-required/);
  assert.throws(() => validateCloudBrowserConnection({ ...safe, extensionsEnabled: true }), /local-boundary-required/);
  assert.throws(() => validateCloudBrowserConnection({ ...safe, humanApproval: ["submit"] }), /approval-policy-required/);
  assert.throws(() => validateCloudBrowserConnection({ ...safe, domains: ["*"] }), /domain-invalid/);
});
