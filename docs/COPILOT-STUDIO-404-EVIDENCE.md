# Copilot Studio connected-agent 404 evidence

Captured 2026-08-13 from the published **General Mahoraga** agent in the **Vaco (default) (Upgrade)** environment.

## Runtime failures supplied by the user

| Connected agent | Result | Conversation ID | UTC |
|---|---|---|---|
| Researcher | `connectorRequestFailure`, HTTP 404 | `a63eba48-2cfe-40c9-9366-b7840a587fa3` | `2026-08-13T03:48:26.752Z` |
| App Builder | `connectorRequestFailure`, HTTP 404 | `3049bffe-df68-4abd-9ade-4bb8ace3c8ae` | `2026-08-13T03:56:37.804Z` |
| Researcher, after creating and saving a fresh connection | `ConnectorRequestFailure`, HTTP 404 | `350eb491-9cfe-4c96-98b1-d98d81c01c41` | `2026-08-13T04:27:43.544Z` |

## Studio configuration evidence

The Agents grid showed nine enabled entries with blank design-time error and blocked columns: Adobe, AI Learning Advisor, Analyst, App Builder, Bridge Scout, Idea Coach, Mahoraga AI Learning Advisor, Mahoraga Work Liaison, and Researcher.

App Builder and Researcher both showed:

- Enabled: Yes
- Available to: General Mahoraga
- Use policy: Agent may use this tool at any time
- Ask end user before running: No
- Credentials: End user credentials
- Preconfigured inputs: None
- Studio connectivity indicator: Connected

Connector definition IDs:

- App Builder: `455e7085-6256-4831-be2c-80e465451246`
- Researcher: `5cd1f9c6-7b56-4961-bbe5-b4feedf9866c`

## Failure boundary and cause assessment

The local Mahoraga listener was healthy at the time of inspection and these Microsoft-owned connected agents do not call it. Copilot Studio accepted each agent definition and reached its connector dispatch path, then received HTTP 404 from the downstream provider. The shared failure boundary is therefore the tenant-side Microsoft agent connection/resource resolution layer.

Creating a fresh Researcher connection, saving it, and immediately retesting produced another 404 with a new conversation ID. This rules out a stale saved connection as the primary cause. The confirmed failure is a missing or inaccessible Microsoft-managed downstream agent resource. The remaining cause classes are tenant/user entitlement, supported-region availability, environment upgrade/provisioning state, or tenant policy. These require Microsoft service-side or tenant-admin evidence. The design-time **Connected** label does not prove that the downstream runtime resource exists.

## Exact read-only local bridge evidence

- Product/version: Mahoraga 2.0.0
- Phase: production
- Listener: `127.0.0.1:4782`, healthy
- Startup: Windows scheduled task `Mahoraga Production Runtime`
- Tasks: 2 completed, 0 failed, 0 queued/running/waiting/cancelled
- Workers: `local-core` ready; `repository` ready; both had zero restarts
- Active capabilities: `system.health`, `manifest.validate`, `repository.inspect`
- Microsoft/Copilot Studio local workers: disabled in the current manifest
- Copilot Studio connection record: production published with Work IQ

This evidence rules out a crash or unavailable local bridge as the cause of the two Microsoft connector 404 responses.

## Recovery order

1. Sign out and back in after confirming the author has Microsoft 365 Copilot and Copilot Studio entitlements and the environment has Dataverse.
2. Confirm tenant policies permit Copilot Studio authors and AI-feature publishing.
3. Confirm Researcher and App Builder are available in the tenant's supported region and environment type.
4. Open a Microsoft support incident with all three correlation records plus this configuration evidence; a fresh connection has already failed.
