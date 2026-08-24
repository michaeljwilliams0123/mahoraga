import test from "node:test";
import assert from "node:assert/strict";
import { DESKTOP_APPLICATIONS, desktopTarget, executeDesktopCapability } from "../src/desktop-worker.mjs";

test("desktop inspection fails closed off Windows without invoking a shell", async () => {
  let called = false;
  const result = await executeDesktopCapability("desktop.inspect", {}, {
    platform: "linux",
    run: async () => { called = true; throw new Error("should-not-run"); },
  });
  assert.equal(called, false);
  assert.equal(result.verified, false);
  assert.equal(result.receiptMetadata.platformSupported, false);
  assert.deepEqual(result.receiptMetadata.allowlistedApplications, Object.keys(DESKTOP_APPLICATIONS));
});

test("desktop inspection stores only bounded window-count metadata", async () => {
  const run = async (executable, args) => {
    assert.equal(executable, "powershell.exe");
    assert.ok(args.includes("-NonInteractive"));
    return {
      stdout: JSON.stringify({
        interactive: true,
        sessionId: 3,
        applications: [
          { process: "chrome", windowCount: 2 },
          { process: "EXCEL", windowCount: 1 },
        ],
      }),
      stderr: "",
    };
  };
  const result = await executeDesktopCapability("desktop.inspect", {}, { platform: "win32", run });
  assert.equal(result.verified, true);
  assert.deepEqual(result.receiptMetadata.applications, [
    { process: "chrome", windowCount: 2 },
    { process: "EXCEL", windowCount: 1 },
  ]);
  assert.equal(JSON.stringify(result).includes("title"), false);
});

test("desktop interaction permits only an exact allowlisted target and focus action", async () => {
  const calls = [];
  const run = async (executable, args) => {
    calls.push({ executable, args });
    return { stdout: JSON.stringify({ verified: true, reason: "focused", windowCount: 1 }), stderr: "" };
  };
  const result = await executeDesktopCapability("desktop.interact", {
    taskArea: "excel",
    requestedOutcome: "focus-window",
  }, { platform: "win32", run });

  assert.equal(result.verified, true);
  assert.equal(result.receiptMetadata.application, "excel");
  assert.equal(result.receiptMetadata.action, "focus-window");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].executable, "powershell.exe");
  assert.equal(calls[0].args.at(-1), "EXCEL");
});

test("desktop target and action boundaries reject caller-selected programs or arbitrary interaction", async () => {
  assert.throws(() => desktopTarget({ taskArea: "powershell" }), /desktop-target-not-allowlisted/);
  await assert.rejects(
    executeDesktopCapability("desktop.interact", { taskArea: "chrome", requestedOutcome: "type password" }, {
      platform: "win32",
      run: async () => { throw new Error("should-not-run"); },
    }),
    /desktop-action-not-allowlisted/,
  );
});
