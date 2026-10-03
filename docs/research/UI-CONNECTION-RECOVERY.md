# UI connection assessment and recovery

Assessed against main `83a0cd39dd0317dbbe5872b1ddd369543ae94d8a`.

| Gap | Implemented improvement |
| --- | --- |
| Same-origin HTTP requests could wait indefinitely | Session/login have 10-second deadlines; actions/artifacts have 60-second deadlines, including response-body decoding. Disconnect aborts pending requests and ignores late completion. |
| Rejected sessions could retain connected state | Owner-auth-required and HTTP 401 clear cloud authentication. Disconnect notifications clear workspace capability observations. |
| Failed iframe load remained cached | Failed loads destroy the frame and listener; another attach can create a new frame. Disconnect settles pending loads. |
| Connection retry reloaded the entire page | Retry rebuilds the connection without clearing the current conversation, composed text, or staged files. It does not replay actions. |
| Every connection was labeled an encrypted WebSocket | Connections now identifies the authenticated Pages bridge, same-origin session, or encrypted relay actually in use. |
| Delayed bridge authentication could survive disconnect or overwrite a newer connection | Authentication attempts and responses are bound to the current connection generation. Disconnect/revoke invalidates pending authentication; stale replies and old authentication failures cannot restore or clear a replacement session. Current authentication expiry still clears connected state. |

Timeouts do not prove that server-side work stopped. The UI instructs the owner to inspect work before resubmitting. No automatic mutation retry, provider fallback, credential persistence, new authentication boundary, or Windows activation is introduced.

## Further improvements

- Refresh readiness observations with bounded, non-overlapping polling and visible observation age. Pause background tabs and distinguish stale evidence from unavailable evidence.
- Add authenticated live receipt streaming only when a genuine owner-authenticated transport exists. The current `telemetry-session-unavailable` response remains truthful; a telemetry secret alone does not establish owner session authority.
- Reconcile accepted tasks and durable replies after reconnect, using canonical task/conversation identity without replaying an uncertain mutation.
- Run an owner-authenticated browser acceptance transaction on the canonical deployed SHA to verify sign-in, action receipt, disconnect, and recovery. Unit tests and source integration do not establish live acceptance.

Windows production remains `3.6.0`.
