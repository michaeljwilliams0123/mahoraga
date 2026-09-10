# Power Platform UCF Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Power Platform/Copilot Studio a live UCF provider that can discover authorized agents, report sanitized readiness, and complete a private machine-to-General-Mahoraga conversation round trip.

**Architecture:** Add one bounded Power Platform worker behind the existing UCF contracts. PAC is used only for discovery/administration metadata; runtime conversation uses Microsoft's JavaScript Copilot Studio client (`@microsoft/agents-copilotstudio-client`) with delegated user authentication. Tenant/environment/agent/client identifiers and connection strings are runtime-only values and never enter Git, task payloads, receipts, or model prompts.

**Tech Stack:** Node.js 24 ESM, `@microsoft/agents-copilotstudio-client` ^1.7.2, `@azure/msal-node` ^5.5.0, existing PAC 2.12.1, existing UCF/router/owner-authority/runtime worker contracts, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-10-power-platform-ucf-provider-design.md`

## Global Constraints

- Keep the repository free of live tenant IDs, environment URLs/IDs, agent GUIDs, user addresses, connection strings, bearer tokens, cookies, client secrets, and callback secrets.
- Keep `studio.delegate` limited to registered logical roles; no caller-selected recipient, URL, executable, shell, or raw agent ID.
- Require the full registered owner/platform/capability scope intersection already enforced by UCF.
- Prefer Microsoft 365 Agents SDK/Copilot Studio client; Direct Line is fallback only when the SDK cannot satisfy the scenario.
- Development communication is owner + registered Mahoraga/Copilot Studio agents only.
- No public ingress is required in this plan; tunnel/reverse-proxy work is deferred to P5.
- No Copilot Studio agent receives direct arbitrary repository mutation authority.
- This plan lands P1-P3 plus the live private handshake. P4 mutation-candidate synthesis and P5 optional ingress are separate follow-on plans after this vertical slice is proven.

---

### Task 1: Sanitized Power Platform discovery and health

**Files:**
- Create: `src/power-platform-provider.mjs`
- Create: `test/power-platform-provider.test.mjs`
- Modify: `src/provider-readiness.mjs`
- Modify: `test/provider-readiness.test.mjs`

**Interfaces:**
- Produces: `probePowerPlatformProvider({ runPac, platform, env }) -> Promise<{ verified, summary, providerHealth }>`
- Produces: `discoverPowerPlatformAgents({ runPac }) -> Promise<Array<{ alias, published, active, provisioned }>>`
- Produces: `executePowerPlatformCapability(capability, task, worker, dependencies) -> Promise<result>` for `powerplatform.health` and `powerplatform.discover`.
- `providerHealth` exposes only `platformSupported`, `authenticated`, `authenticationClass`, `publishedAgentCount`, `activeAgentCount`, `provisionedAgentCount`, and bounded logical aliases.

- [ ] **Step 1: Write failing discovery sanitizer tests**

```js
const result = await discoverPowerPlatformAgents({ runPac: async () => ({ stdout: fixture }) });
assert.deepEqual(result.map(x => x.alias), ["general-mahoraga", "tenant-health-reader", "enterprise-core"]);
assert.equal(JSON.stringify(result).includes("22839bcc"), false);
assert.equal(JSON.stringify(result).includes("org9aade5b6"), false);
assert.equal(JSON.stringify(result).includes("@"), false);
```

- [ ] **Step 2: Run RED**

Run: `node --test --test-isolation=none test/power-platform-provider.test.mjs`
Expected: FAIL because `src/power-platform-provider.mjs` does not exist.

- [ ] **Step 3: Implement bounded PAC discovery**

```js
const LOGICAL_AGENTS = Object.freeze(new Map([
  ["general mahoraga", "general-mahoraga"],
  ["mahorago tenant health reader", "tenant-health-reader"],
  ["mahorago enterprise core", "enterprise-core"],
]));

export async function discoverPowerPlatformAgents({ runPac = execFileAsync } = {}) {
  const { stdout } = await runPac("pac.cmd", ["copilot", "list"], PAC_OPTIONS);
  return sanitizePacCopilotList(stdout);
}
```

Parse only allowlisted display names plus `Published`, `Active`, and `Provisioned` status tokens. Discard GUID columns, environment text, user identity, and all unrecognized rows.

- [ ] **Step 4: Add provider-readiness integration**

Add a required `powerPlatform` probe to `collectProviderReadiness` (provider count becomes 10), a bounded `powerPlatformState()`, and a `power-platform` connector summary exposing `studio.delegate`/`powerplatform.discover` only when the provider is verified.

- [ ] **Step 5: Run GREEN**

Run: `node --test --test-isolation=none test/power-platform-provider.test.mjs test/provider-readiness.test.mjs`
Expected: PASS with no raw PAC identifiers in serialized readiness output.

- [ ] **Step 6: Commit**

```bash
git add src/power-platform-provider.mjs src/provider-readiness.mjs test/power-platform-provider.test.mjs test/provider-readiness.test.mjs
git commit -m "feat(power-platform): add sanitized provider discovery"
```

### Task 2: Runtime-only Copilot Studio connection settings and delegated token broker

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/copilot-studio-auth.mjs`
- Create: `test/copilot-studio-auth.test.mjs`

**Interfaces:**
- Produces: `loadCopilotStudioRuntimeSettings(env) -> { connectionSettings, tenantId, appClientId }`
- Produces: `createCopilotTokenProvider(settings, { PublicClientApplication, openBrowser }) -> { getToken({ allowInteractive }) }`
- Runtime variables: `MAHORAGA_COPILOT_DIRECT_CONNECT_URL` OR both `MAHORAGA_COPILOT_ENVIRONMENT_ID` + `MAHORAGA_COPILOT_SCHEMA_NAME`; plus `MAHORAGA_COPILOT_TENANT_ID` and `MAHORAGA_COPILOT_APP_CLIENT_ID`.
- No client secret is supported in this first slice; delegated user auth only.

- [ ] **Step 1: Add SDK dependencies**

Run: `npm.cmd install @microsoft/agents-copilotstudio-client@^1.7.2 @azure/msal-node@^5.5.0`

- [ ] **Step 2: Write RED settings/auth tests**

```js
const settings = loadCopilotStudioRuntimeSettings({
  MAHORAGA_COPILOT_DIRECT_CONNECT_URL: "https://runtime-only.example/direct",
  MAHORAGA_COPILOT_TENANT_ID: "tenant-runtime-value",
  MAHORAGA_COPILOT_APP_CLIENT_ID: "client-runtime-value",
});
assert.equal(settings.connectionSettings.directConnectUrl.includes("runtime-only"), true);
assert.equal(JSON.stringify(settings).includes("secret"), false);
```

Also assert startup health with `allowInteractive:false` never invokes `openBrowser`, and token-provider errors normalize to `authentication-required` without embedding MSAL error text.

- [ ] **Step 3: Run RED**

Run: `node --test --test-isolation=none test/copilot-studio-auth.test.mjs`
Expected: FAIL because the auth module does not exist.

- [ ] **Step 4: Implement runtime settings and delegated token acquisition**

```js
export function loadCopilotStudioRuntimeSettings(env = process.env) {
  const directConnectUrl = value(env.MAHORAGA_COPILOT_DIRECT_CONNECT_URL);
  const environmentId = value(env.MAHORAGA_COPILOT_ENVIRONMENT_ID);
  const schemaName = value(env.MAHORAGA_COPILOT_SCHEMA_NAME);
  const tenantId = value(env.MAHORAGA_COPILOT_TENANT_ID);
  const appClientId = value(env.MAHORAGA_COPILOT_APP_CLIENT_ID);
  if (!tenantId || !appClientId || (!directConnectUrl && !(environmentId && schemaName))) throw code("copilot-studio-runtime-binding-missing");
  return Object.freeze({ connectionSettings: Object.freeze({ directConnectUrl, environmentId, schemaName, cloud: "Prod", copilotAgentType: "Published" }), tenantId, appClientId });
}
```

Use `CopilotStudioClient.scopeFromSettings(connectionSettings)` as the requested MSAL scope. `getToken({allowInteractive:false})` tries only existing in-process accounts with `acquireTokenSilent`; `allowInteractive:true` may use `acquireTokenInteractive` and the system browser. Never log token values or full MSAL exceptions.

- [ ] **Step 5: Run GREEN**

Run: `node --test --test-isolation=none test/copilot-studio-auth.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/copilot-studio-auth.mjs test/copilot-studio-auth.test.mjs
git commit -m "feat(copilot-studio): add delegated runtime authentication"
```

### Task 3: Direct Copilot Studio conversation client

**Files:**
- Create: `src/copilot-studio-client.mjs`
- Create: `test/copilot-studio-client.test.mjs`

**Interfaces:**
- Consumes: `loadCopilotStudioRuntimeSettings()` and `createCopilotTokenProvider()` from Task 2.
- Produces: `invokeCopilotStudioAgent({ role, prompt, idempotencyKey }, { env, tokenProvider, CopilotStudioClientCtor }) -> Promise<{ verified, responseText, providerReceipt }>`
- Supported initial roles: `reasoner`, `researcher`, `analyst`, `builder-advisor`, `validator`, `workflow-advisor`.

- [ ] **Step 1: Write RED role/transport tests**

```js
const result = await invokeCopilotStudioAgent(
  { role: "reasoner", prompt: "MAHORAGA-LINK-HEALTH", idempotencyKey: "health-1" },
  { tokenProvider: fakeTokenProvider, CopilotStudioClientCtor: FakeCopilotStudioClient, env: runtimeEnv },
);
assert.equal(result.verified, true);
assert.equal(result.responseText, "HANDSHAKE-ACK | General Mahoraga");
assert.equal(result.providerReceipt.role, "reasoner");
assert.equal(JSON.stringify(result.providerReceipt).includes("HANDSHAKE-ACK"), false);
```

Also assert an arbitrary role, recipient ID, URL, shell field, or raw agent GUID is rejected before any client call.

- [ ] **Step 2: Run RED**

Run: `node --test --test-isolation=none test/copilot-studio-client.test.mjs`
Expected: FAIL because the conversation client does not exist.

- [ ] **Step 3: Implement streaming conversation**

```js
const settings = loadCopilotStudioRuntimeSettings(env);
const token = await tokenProvider.getToken({ allowInteractive: true });
const client = new CopilotStudioClientCtor(settings.connectionSettings, token);
let conversationId = "";
for await (const activity of client.startConversationStreaming({ emitStartConversationEvent: false, locale: "en-US" })) {
  if (activity?.conversation?.id) conversationId = activity.conversation.id;
}
for await (const activity of client.sendActivityStreaming({ type: "message", text: prompt, conversation: { id: conversationId } })) {
  if (activity?.type === "message" && typeof activity.text === "string") replies.push(activity.text);
}
```

Return raw reply text only in the private in-process result. `providerReceipt` contains role, provider class, reply count, latency, outcome, and booleans; it never contains prompt/reply/token/tenant/environment/agent/client values.

- [ ] **Step 4: Add bounded failure normalization**

Map missing runtime binding/auth to `authentication-required`; no conversation/reply to `agent-unavailable`; throttling to `rate-limited`; malformed activity to `invalid-contract`; network/service 5xx to `transient-provider`. Preserve no provider free-text in the normalized receipt.

- [ ] **Step 5: Run GREEN**

Run: `node --test --test-isolation=none test/copilot-studio-client.test.mjs test/copilot-studio-auth.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/copilot-studio-client.mjs test/copilot-studio-client.test.mjs
git commit -m "feat(copilot-studio): add direct agent conversation client"
```

### Task 4: Register Power Platform and Copilot Studio workers in UCF

**Files:**
- Modify: `mahoraga.manifest.json`
- Modify: `src/config.mjs`
- Modify: `src/worker-process.mjs`
- Create: `src/copilot-studio-worker.mjs`
- Modify: `src/task-policy.mjs`
- Modify: `src/conversation-capability-planner.mjs`
- Test: `test/config.test.mjs`
- Test: `test/router.test.mjs`
- Test: `test/conversation-capability-planner.test.mjs`
- Create: `test/copilot-studio-worker.test.mjs`

**Interfaces:**
- `power-platform` worker exposes `powerplatform.health` and `powerplatform.discover`.
- `copilot-studio` worker exposes existing `studio.health` and `studio.delegate`; `studio.configure`, `studio.provision`, and `studio.deploy` remain registered but are not invoked by this plan.
- `studio.delegate` retains full scopes `connector.invoke + copilot.invoke`.
- Produces: `executeCopilotStudioCapability(capability, task, worker, dependencies) -> Promise<result>`; `studio.health` stays side-effect free and `studio.delegate` calls only `invokeCopilotStudioAgent()`.

- [ ] **Step 1: Write RED manifest/router tests**

```js
const manifest = await loadManifest();
const studio = manifest.workers.find(x => x.id === "copilot-studio");
const power = manifest.workers.find(x => x.id === "power-platform");
assert.equal(power.enabled, true);
assert.equal(studio.enabled, true);
assert.deepEqual(power.capabilities, ["powerplatform.health", "powerplatform.discover"]);
assert.deepEqual(studio.authorityScopesByCapability["studio.delegate"], ["connector.invoke", "copilot.invoke"]);
```

Add a router test proving `studio.delegate` is routable only when both owner/platform scopes exist and readiness is verified; missing either scope remains blocked.

- [ ] **Step 2: Run RED**

Run: `node --test --test-isolation=none test/config.test.mjs test/router.test.mjs test/conversation-capability-planner.test.mjs`
Expected: FAIL because `power-platform` is not registered and the studio worker has no runtime implementation.

- [ ] **Step 3: Wire worker dispatch and manifest validation**

```js
if (capability.startsWith("powerplatform.")) return executePowerPlatformCapability(capability, task, worker);
if (capability.startsWith("studio.")) return executeCopilotStudioCapability(capability, task, worker);
```

`studio.health` calls sanitized provider discovery plus runtime-binding presence with `allowInteractive:false`; `studio.delegate` calls `invokeCopilotStudioAgent` only after normal task-policy/authority routing admits it. `powerplatform.discover` is read-only and side-effect free.

- [ ] **Step 4: Teach the conversation planner the new reasoning lane**

Natural requests explicitly asking Mahoraga to consult/validate with Copilot Studio may plan `studio.delegate`; ordinary Microsoft 365 requests continue preferring `m365.reason`. Generic conversation must not automatically fan out to Studio.

- [ ] **Step 5: Run GREEN**

Run: `node --test --test-isolation=none test/config.test.mjs test/router.test.mjs test/conversation-capability-planner.test.mjs test/power-platform-provider.test.mjs test/copilot-studio-client.test.mjs`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add mahoraga.manifest.json src/config.mjs src/worker-process.mjs src/copilot-studio-worker.mjs src/task-policy.mjs src/conversation-capability-planner.mjs test/config.test.mjs test/router.test.mjs test/conversation-capability-planner.test.mjs test/copilot-studio-worker.test.mjs
git commit -m "feat(ucf): register Power Platform provider family"
```

### Task 5: Live private handshake, repair baseline, and full verification

**Files:**
- Create: `scripts/copilot-studio-smoke.mjs`
- Modify: `src/repair.mjs`
- Modify: `test/repair.test.mjs`
- Refresh: `state/release-baseline/**`

**Interfaces:**
- Smoke script sends only `MAHORAGA-LINK-HEALTH` to the runtime-bound `reasoner` agent and expects `HANDSHAKE-ACK | General Mahoraga`.
- The script accepts no recipient, channel, arbitrary prompt, URL, or agent ID arguments.

- [ ] **Step 1: Write RED smoke-script contract tests**

Assert the script exports/uses a fixed health prompt and rejects any CLI attempt to supply a recipient, agent GUID, URL, shell command, or alternate prompt.

- [ ] **Step 2: Run RED**

Run: `node --test --test-isolation=none test/copilot-studio-client.test.mjs test/repair.test.mjs`
Expected: FAIL until the smoke entry point and repair coverage exist.

- [ ] **Step 3: Add live smoke entry point and repair coverage**

The smoke script loads only runtime environment settings, obtains delegated auth, invokes logical role `reasoner`, and exits 0 only when the exact private handshake response is observed. Add `src/power-platform-provider.mjs`, `src/copilot-studio-auth.mjs`, `src/copilot-studio-client.mjs`, and the smoke script to `ESSENTIAL_FILES`.

- [ ] **Step 4: Run the live private handshake**

Run: `node scripts/copilot-studio-smoke.mjs`
Expected: `HANDSHAKE-ACK | General Mahoraga` and exit 0. If Microsoft requires first-time interactive consent, complete only the Copilot Studio delegated sign-in for the owner; do not message any human/channel and do not persist the token in Git/logs.

- [ ] **Step 5: Refresh and verify the repair baseline**

Run: `npm.cmd run baseline:refresh && node --test --test-isolation=none test/repair.test.mjs`
Expected: PASS and the essential-file count increases to include the new provider/auth/client/smoke files.

- [ ] **Step 6: Run full verification**

Run: `npm.cmd run verify`
Expected: exit 0 with no failed tests.

- [ ] **Step 7: Commit the verified release state**

```bash
git add scripts/copilot-studio-smoke.mjs src/repair.mjs test/repair.test.mjs state/release-baseline
git commit -m "test(power-platform): verify private Copilot Studio round trip"
```

- [ ] **Step 8: Push PR #293 head and require exact-head Verify**

Push `feature/power-platform-ucf`, update PR #293 from design-only to implemented scope, and require both `Verify (ubuntu-latest)` and `Verify (windows-latest)` on the exact pushed SHA before any merge.
