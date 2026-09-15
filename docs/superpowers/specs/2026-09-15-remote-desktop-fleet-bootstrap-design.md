# Remote Desktop Fleet Bootstrap Design

## Status

Owner-approved architecture in conversation on 2026-09-15. This design extends Mahoraga's existing MCP host, capability router, task lifecycle, adaptive-aperture, relay, and autonomous-integration foundations. It does not replace the existing Node control plane or local desktop worker.

## Goal

Make Mahoraga cloud-first and broadly compatible with local computers by allowing the cloud runtime to distribute a small, signed device bootstrap that installs or configures an approved Remote Desktop Commander client, enrolls the machine into Mahoraga's governed fleet, verifies its capabilities, and then exposes that machine as an on-demand desktop execution worker.

Remote Desktop Commander is the first executor adapter. The fleet bootstrap contract must remain provider-neutral so later browser, build, GPU, local-model, or other local executors can use the same enrollment framework.

## Non-goals

- No claim that a powered-off or completely unmanaged device can be reached before any trusted communication path exists.
- No embedding of permanent Remote Desktop Commander or Mahoraga root credentials in downloadable bootstrap artifacts.
- No silent weakening of Windows, macOS, Linux, firewall, endpoint, filesystem, or administrator controls.
- No full-filesystem access by default.
- No permanent arbitrary public tunnel or unbounded inbound listener.
- No redistribution of third-party binaries unless their licensing and distribution terms explicitly allow it.
- No removal of the existing local desktop execution path; it remains a fallback.

## 1. Target Architecture

The primary desktop path is:

`Mahoraga UI -> cloud/runtime control plane -> governed MCP host -> remote-mcp transport -> Remote Desktop Commander service -> selected enrolled device`

The existing local desktop path remains available as a lower-priority fallback when policy and runtime locality permit it.

Mahoraga remains the brain and authority layer. Remote Desktop Commander provides transport and local execution tools. A local device is an execution worker, not a source of authority.

## 2. Remote MCP Transport

Mahoraga's MCP host currently admits only `local-process` transports. Add a governed `remote-mcp` transport rather than a parallel integration stack.

A remote provider declaration must preserve the current MCP host invariants:

- explicit provider identity;
- explicit tool allowlist;
- schema validation before routing;
- permission class;
- spending class;
- data-class boundary;
- credential reference rather than raw credential material;
- request and response byte limits;
- bounded timeout;
- readiness probe and canary;
- fail-closed behavior when discovery, authentication, schema validation, or invocation fails.

The Remote Desktop Commander endpoint is configured server-side. Browser code never receives provider bearer credentials, refresh tokens, enrollment secrets, or equivalent reusable secrets.

## 3. Fleet Registry

Mahoraga maintains a durable fleet registry separate from display names. Each device record contains at minimum:

- stable `deviceId` assigned by the remote executor/provider;
- display name;
- executor adapter/provider ID;
- platform and architecture when verified;
- lifecycle state;
- trust state;
- role labels such as `general-windows` or `heavy-worker`;
- discovered and admitted capabilities;
- last heartbeat and last successful canary timestamps;
- current enrollment ID when enrollment is active;
- preferred/fallback routing rank;
- quarantine reason when applicable.

Human-readable hostnames are metadata only. They never substitute for stable device identity.

### 3.1 Device lifecycle

Operational lifecycle:

`ready -> busy -> ready`

Connectivity states may include:

`online`, `offline`, `degraded`, `unknown`.

Enrollment lifecycle:

`enrollment-requested -> bootstrapping -> authenticating -> registering -> verifying -> ready`

Exceptional states include:

`waiting-for-user-bootstrap`, `auth-required`, `policy-blocked`, `offline`, `quarantined`, and `revoked`.

## 4. Mahoraga Fleet Bootstrap

### 4.1 User experience

From the Mahoraga interface the owner can request **Add this device**. Mahoraga creates a bounded enrollment intent and returns a small platform-appropriate bootstrap download or command.

For a completely unmanaged machine, one trusted local action is required to start the bootstrap. After that, Mahoraga performs the remaining supported provisioning automatically.

Where a pre-existing trusted management channel is available, Mahoraga may deliver and execute the bootstrap through that channel for zero-touch enrollment.

### 4.2 Bootstrap responsibilities

The bootstrap performs only bounded provisioning work:

1. identify platform and architecture;
2. verify basic prerequisites;
3. retrieve the approved executor installer from its authoritative distribution source when possible;
4. verify expected integrity metadata before execution;
5. install or repair the executor where local authorization permits;
6. configure startup/reconnect behavior when supported;
7. authenticate using the one-time enrollment flow;
8. cause the device to appear through the remote executor service;
9. return only bounded enrollment evidence to Mahoraga;
10. terminate bootstrap authority after successful or expired enrollment.

Mahoraga should host the orchestration/bootstrap artifact, not third-party binaries, unless redistribution is explicitly permitted.

### 4.3 Enrollment credential

The bootstrap receives a single-purpose, short-lived enrollment credential or proof. It must be:

- bound to one enrollment intent;
- bounded by expiry;
- replay-resistant;
- unusable as Mahoraga root authority;
- unusable as a permanent Remote Desktop Commander credential;
- invalidated after successful enrollment or terminal cancellation.

Permanent provider credentials remain in the server-side credential store or supported OS/secret-store reference.

## 5. Device Admission

A newly visible device is not automatically trusted. Mahoraga binds the observed remote device identity to the active enrollment intent, then performs admission checks.

Admission requires:

- expected enrollment proof;
- supported provider identity;
- acceptable platform/runtime metadata;
- successful heartbeat;
- successful capability discovery;
- successful harmless canary invocation;
- confirmation that admitted tools remain inside Mahoraga's allowlist and policy classes.

Identity mismatch, repeated failed canaries, unexpected capability expansion, invalid credentials, or materially changed execution boundaries cause quarantine rather than silent trust.

## 6. Routing and Execution

Desktop objectives are routed through the capability planner and existing authority model.

The router ranks compatible devices using verified factors such as:

1. capability match;
2. trust/readiness state;
3. online state;
4. requested platform or role;
5. recent successful evidence;
6. recent failure penalty;
7. workload suitability;
8. fallback cost and latency.

A request may explicitly select a stable device ID. Device names are accepted only as user-facing selectors that resolve to a unique stable ID.

Remote Desktop Commander is preferred for remote desktop execution. The existing local desktop adapter remains a governed fallback rather than being removed.

## 7. Offline and Recovery Behavior

An offline worker is not treated as immediate objective failure.

When the required worker is unavailable Mahoraga may:

- route to another compatible trusted worker;
- place the objective in `waiting` while preserving the intended operation;
- resume automatically when the worker heartbeat returns;
- use the existing local desktop fallback when admissible;
- enter `waiting_for_user` only when a genuinely unavoidable local action is required.

A task must not replay an already completed side effect merely because connectivity was lost. Resume behavior must use existing idempotency/evidence contracts.

Wake-on-LAN, AMT/vPro, or another supported power-control adapter may later be added behind the fleet contract. Power control is not required for the first bootstrap release and must never be implied when the hardware does not support it.

## 8. Adaptive Aperture Integration

Remote desktop access uses Mahoraga's existing specialized-purpose aperture model rather than creating an unrestricted tunnel.

For a desktop objective, the aperture is bounded by:

- objective ID;
- capability class such as `mcp-remote` or `desktop-interactive`;
- expected provider/peer;
- selected target device;
- lease TTL and idle TTL;
- lateral-routing prohibition by default;
- existing validator/authority requirements;
- deterministic close reasons.

Heartbeat loss, peer mismatch, integrity failure, revocation, lease expiry, objective completion, or device loss closes or invalidates the active route according to existing aperture contracts.

## 9. Mahoraga Interface

The interface exposes fleet state without exposing reusable secrets.

Minimum views/actions:

- list enrolled devices;
- show `ready`, `busy`, `offline`, `degraded`, `enrolling`, `quarantined`, and `revoked` states;
- show last verified heartbeat/canary evidence;
- request **Add this device**;
- obtain the short-lived bootstrap download/command;
- show enrollment progress and the one remaining user action, if any;
- request a task on a specific worker;
- revoke/quarantine a worker;
- show queued work waiting on an offline worker.

Normal use remains conversation-first. A user should be able to say, for example, "add this laptop," "use the fastest Windows worker," or "run this on SD009WC7," and Mahoraga resolves the corresponding governed operations.

## 10. Security and Authority Boundaries

Mahoraga may autonomously discover authorized workers, choose among trusted workers, reconnect/recover enrolled workers, provision a worker after an authorized enrollment intent, retry interrupted enrollment, configure supported startup/health behavior, and quarantine anomalous devices.

Mahoraga may not:

- bypass OS or administrator authentication;
- expand filesystem scope to unrestricted access merely for convenience;
- disable endpoint/firewall/security controls to obtain connectivity;
- place permanent secrets in browser JavaScript or bootstrap downloads;
- trust a device solely from hostname or user-supplied label;
- treat a failed or unverifiable installer download as successful enrollment;
- silently convert a bounded aperture into a permanent public tunnel.

Owner seal, revoke, recovery, and repository governance remain authoritative.

## 11. Provider-Neutral Executor Contract

Desktop Commander is executor adapter version 1, not the fleet abstraction itself.

The fleet layer defines provider-neutral operations such as:

- discover devices;
- inspect device readiness;
- discover admitted capabilities;
- invoke a capability on a selected device;
- request enrollment;
- observe enrollment state;
- quarantine/revoke a device;
- record heartbeat/canary evidence.

A future browser worker, build worker, GPU worker, or local-model worker can implement this executor contract without changing the fleet lifecycle or enrollment authority model.

## 12. First Implementation Scope

The first implementation should be deliberately narrow:

1. extend the MCP host contract to support a governed `remote-mcp` transport while preserving `local-process`;
2. add the Remote Desktop Commander provider adapter and server-side credential reference;
3. add the fleet registry and deterministic device states;
4. project fleet status into runtime/API/UI state;
5. add worker selection by stable device ID;
6. integrate offline workers with existing `waiting` / `waiting_for_user` task behavior;
7. implement the enrollment-intent and one-time bootstrap contract;
8. produce a Windows-first bootstrap artifact that retrieves/configures the approved executor through its supported distribution/authentication path;
9. admit a device only after discovery plus harmless canary evidence;
10. preserve the local desktop adapter as fallback;
11. add focused tests and keep the full repository verification gate green.

macOS/Linux bootstrap execution can follow the same contract after the Windows path has real evidence. The provider-neutral interfaces must not hard-code Windows semantics into the fleet model.

## 13. Acceptance Criteria

The release is not complete merely because a UI card displays devices.

Required proof:

- Remote MCP discovery succeeds through Mahoraga's governed MCP host.
- Existing enrolled devices such as SD009WC7 and BV612T3 can be represented by stable IDs when they are visible to the authenticated provider.
- Mahoraga can target one specific enrolled device and execute a harmless canary with persisted evidence.
- Taking a worker offline transitions dependent work to an appropriate waiting state rather than losing the objective or reporting false completion.
- Returning a worker allows eligible waiting work to resume without replaying completed side effects.
- The local desktop path remains usable as fallback where policy allows it.
- A new enrollment intent produces an expiring one-time bootstrap artifact or command without permanent credentials.
- A new Windows device can proceed from bootstrap through registration, capability discovery, canary, and `ready` state with no additional manual configuration beyond unavoidable OS/provider authorization.
- Expired or replayed enrollment proofs are rejected.
- Device identity mismatch results in quarantine.
- Browser/UI responses never expose reusable provider or enrollment secrets.
- Existing MCP boundary tests remain valid for local providers.
- New remote transport, fleet, enrollment, recovery, and security behavior has deterministic tests.
- Full `npm run verify` passes on the exact candidate head before merge.

## 14. Rollout Sequence

Phase 1 establishes deterministic contracts and a mocked remote transport.

Phase 2 binds the real authenticated Remote Desktop Commander endpoint and proves discovery/canary against an already enrolled worker.

Phase 3 enables Windows Fleet Bootstrap and proves enrollment on a new or reset worker.

Phase 4 adds automated offline recovery and optional supported power-control adapters.

Phase 5 adds additional executor adapters or operating systems only after the provider-neutral contract has production evidence.

At every phase, unsupported functionality remains explicitly unavailable rather than simulated as successful.