# Signed Browser Live Readiness Design

## Goal
Close the false `signed-browser-session` gap by aligning canonical configuration, the existing signed-Chrome worker, provider readiness, and connector readiness.

## Existing capability
`src/signed-chrome-worker.mjs` already provides `chrome.health` and `chrome.open` on Windows using the attended Chrome application. `src/google-workspace-worker.mjs` already routes approved Workspace hosts through that worker. Remote debugging, profile export, browser credential access, and page-content claims remain prohibited.

## Required behavior
- Canonical `browser.signedSessionEnabled` is true when the signed-Chrome contract is shipped.
- Gap audit closes `signed-browser-session` only when the flag, worker, implementation, and tests are all present.
- Provider readiness probes `signedChrome` and `googleWorkspace` in addition to the existing seven providers.
- Readiness output remains content-free and bounded.
- Google connector readiness becomes `ready` only from verified Google Workspace or signed-Chrome evidence.
- The live Windows probe must verify the signed-Chrome lane before integration.

## Non-goals
No CDP listener, DevTools port, browser-profile copying/export, cookie/token reading, arbitrary local URLs, public tunnel, or direct Google API authentication.