import test from "node:test";
import assert from "node:assert/strict";
import { DESKTOP_APPLICATIONS, desktopTarget, executeDesktopCapability } from "../src/desktop-worker.mjs";
import { loadManifest, ROOT } from "../src/config.mjs";

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


test("desktop powershell runs only fixed diagnostic scripts", async () => {
  let calls = 0;
  const run = async (executable) => {
    calls += 1;
    assert.equal(executable, "powershell.exe");
    return { stdout: JSON.stringify({ verified: true, powershellMajor: 7, process64Bit: true, os64Bit: true }), stderr: "" };
  };
  const result = await executeDesktopCapability("desktop.powershell", { requestedOutcome: "system-info" }, { platform: "win32", run });
  assert.equal(result.verified, true);
  assert.deepEqual(result.receiptMetadata, { scriptId: "system-info", powershellMajor: 7, process64Bit: true, os64Bit: true });
  assert.equal(JSON.stringify(result).includes("stdout"), false);
  await assert.rejects(
    executeDesktopCapability("desktop.powershell", { requestedOutcome: "Get-ChildItem Env:" }, { platform: "win32", run }),
    /desktop-powershell-script-not-allowlisted/,
  );
  assert.equal(calls, 1);
});

test("desktop filesystem hashes only repo-relative allowlisted files", async () => {
  let calls = 0;
  const run = async (_executable, args, options) => {
    calls += 1;
    assert.equal(args.includes("package.json"), false);
    assert.equal(options.env.MAHORAGA_DESKTOP_RELATIVE, "package.json");
    assert.equal(options.env.MAHORAGA_DESKTOP_ROOT, ROOT);
    return { stdout: JSON.stringify({ verified: true, kind: "file", sizeBytes: 512, sha256: "a".repeat(64) }), stderr: "" };
  };
  const result = await executeDesktopCapability("desktop.filesystem", {
    requestedOutcome: "hash-allowed-files",
    allowedPaths: ["package.json"],
  }, { platform: "win32", run });
  assert.equal(result.verified, true);
  assert.match(result.receiptMetadata.entries[0].pathSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.receiptMetadata.entries[0].sha256, "a".repeat(64));
  assert.equal(JSON.stringify(result).includes("package.json"), false);
  await assert.rejects(
    executeDesktopCapability("desktop.filesystem", { requestedOutcome: "hash-allowed-files", allowedPaths: ["../secret.txt"] }, { platform: "win32", run }),
    /desktop-filesystem-path-invalid/,
  );
  assert.equal(calls, 1);
});

test("desktop process inspection returns bounded allowlisted telemetry only", async () => {
  const run = async () => ({
    stdout: JSON.stringify({ processes: [
      { process: "chrome", processCount: 2, windowCount: 1, workingSetBytes: 4096 },
      { process: "notepad", processCount: 1, windowCount: 1, workingSetBytes: 2048 },
    ] }),
    stderr: "",
  });
  const result = await executeDesktopCapability("desktop.processes", {}, { platform: "win32", run });
  assert.equal(result.verified, true);
  assert.deepEqual(result.receiptMetadata.processes, [
    { process: "chrome", processCount: 2, windowCount: 1, workingSetBytes: 4096 },
  ]);
  assert.equal(JSON.stringify(result).includes("notepad"), false);
});

test("new desktop execution capabilities fail closed off Windows without invoking a shell", async () => {
  for (const capability of ["desktop.powershell", "desktop.filesystem", "desktop.processes"]) {
    let called = false;
    await assert.rejects(
      executeDesktopCapability(capability, { requestedOutcome: "system-info", allowedPaths: ["package.json"] }, {
        platform: "linux",
        run: async () => { called = true; throw new Error("should-not-run"); },
      }),
      /desktop-windows-required/,
    );
    assert.equal(called, false);
  }
});

test("desktop worker manifest advertises the bounded v1 execution capabilities", async () => {
  const manifest = await loadManifest();
  const worker = manifest.workers.find((item) => item.id === "desktop");
  assert.ok(worker);
  assert.equal(worker.enabled, true);
  assert.deepEqual(worker.capabilities, [
    "desktop.inspect",
    "desktop.interact",
    "desktop.powershell",
    "desktop.filesystem",
    "desktop.processes",
    "communication.send",
  ]);
  assert.equal(worker.healthProbe, "desktop.inspect");
  assert.equal(worker.capabilityCanaries["desktop.powershell"], "provider-derived");
  assert.equal(worker.capabilityCanaries["desktop.filesystem"], "provider-derived");
  assert.equal(worker.capabilityCanaries["desktop.processes"], "direct");
});

test("desktop filesystem live Windows canary hashes a repo file", { skip: process.platform !== "win32" || process.env.MAHORAGA_DESKTOP_LIVE_CANARY !== "1" }, async () => {
  const result = await executeDesktopCapability("desktop.filesystem", {
    requestedOutcome: "hash-allowed-files",
    allowedPaths: ["package.json"],
  });
  assert.equal(result.verified, true);
  assert.equal(result.receiptMetadata.entries.length, 1);
  assert.match(result.receiptMetadata.entries[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(result).includes("package.json"), false);
});

test("Teams send passes recipient and message only through process environment and returns content-free proof", async () => {
  const recipient = "Alex Smith";
  const message = "Deployment is ready.";
  const run = async (executable, args, options) => {
    assert.equal(executable, "powershell.exe");
    assert.equal(options.env.MAHORAGA_TEAMS_RECIPIENT, recipient);
    assert.equal(options.env.MAHORAGA_TEAMS_MESSAGE, message);
    assert.equal(JSON.stringify(args).includes(recipient), false);
    assert.equal(JSON.stringify(args).includes(message), false);
    assert.match(args.join(" "), /InvokePattern/);
    assert.doesNotMatch(args.join(" "), /SendKeys/i);
    return { stdout: JSON.stringify({ verified: true, reason: "sent", windowCount: 1, recipientVerified: true, draftVerified: true, sendInvoked: true, postSendVerified: true }), stderr: "" };
  };
  const result = await executeDesktopCapability("communication.send", {
    requestedOutcome: JSON.stringify({ recipient, message }), idempotencyKey: "teams-send-1",
  }, { platform: "win32", run });
  assert.equal(result.verified, true);
  assert.equal(result.receiptMetadata.application, "teams");
  assert.equal(result.receiptMetadata.action, "recipient-bound-send");
  assert.match(result.receiptMetadata.recipientSha256, /^[a-f0-9]{64}$/);
  assert.match(result.receiptMetadata.messageSha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(result).includes(recipient), false);
  assert.equal(JSON.stringify(result).includes(message), false);
});

test("Teams send rejects malformed or broad recipient envelopes before UI automation", async () => {
  let calls = 0;
  const run = async () => { calls += 1; throw new Error("should-not-run"); };
  await assert.rejects(
    executeDesktopCapability("communication.send", { requestedOutcome: "hello", idempotencyKey: "send-bad-1" }, { platform: "win32", run }),
    /communication-send-envelope-invalid/,
  );
  await assert.rejects(
    executeDesktopCapability("communication.send", { requestedOutcome: JSON.stringify({ recipient: "everyone", message: "Hello" }), idempotencyKey: "send-bad-2" }, { platform: "win32", run }),
    /recipient-not-authorized/,
  );
  await assert.rejects(
    executeDesktopCapability("communication.send", { requestedOutcome: JSON.stringify({ recipient: "Alex Smith", message: "Hello", selector: "x" }), idempotencyKey: "send-bad-3" }, { platform: "win32", run }),
    /communication-send-envelope-invalid/,
  );
  assert.equal(calls, 0);
});

test("Teams send fails closed off Windows without invoking UI automation", async () => {
  let called = false;
  await assert.rejects(executeDesktopCapability("communication.send", {
    requestedOutcome: JSON.stringify({ recipient: "Alex Smith", message: "Hello" }), idempotencyKey: "send-linux",
  }, { platform: "linux", run: async () => { called = true; } }), /desktop-windows-required/);
  assert.equal(called, false);
});

test("Teams send preserves bounded failure evidence for UI verification failures", async () => {
  const cases = [
    ["recipient-mismatch", { recipientVerified: false, draftVerified: false, sendInvoked: false, postSendVerified: false }],
    ["draft-mismatch", { recipientVerified: true, draftVerified: false, sendInvoked: false, postSendVerified: false }],
    ["send-control-unavailable", { recipientVerified: true, draftVerified: true, sendInvoked: false, postSendVerified: false }],
    ["post-send-verification-failed", { recipientVerified: true, draftVerified: true, sendInvoked: true, postSendVerified: false }],
  ];
  for (const [reason, flags] of cases) {
    const result = await executeDesktopCapability("communication.send", {
      requestedOutcome: JSON.stringify({ recipient: "Alex Smith", message: "Hello" }),
      idempotencyKey: `send-${reason}`,
    }, {
      platform: "win32",
      run: async () => ({ stdout: JSON.stringify({ verified: false, reason, windowCount: 1, ...flags }), stderr: "" }),
    });
    assert.equal(result.verified, false);
    assert.equal(result.receiptMetadata.reason, reason);
    assert.equal(JSON.stringify(result).includes("Alex Smith"), false);
    assert.equal(JSON.stringify(result).includes("Hello"), false);
  }
});
