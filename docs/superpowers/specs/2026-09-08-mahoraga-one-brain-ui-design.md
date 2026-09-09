# Mahoraga One Brain UI Design

## Purpose
Mahoraga One is a chat-first, voice-capable operator surface that hides routing machinery while keeping the authoritative paired Mahoraga core in control.

## Experience
- White/silver premium shell with restrained original pop-art, street-art, and shonen-energy accents.
- Chat is the default home. Work, Files, and Advanced are secondary drill-downs.
- Primary actions: Upload, Build, Report, Handoff, Create, and Ship.
- Voice is first-class: start/stop dictation, live transcript into the composer, and optional read-aloud for Mahoraga replies.
- Human language replaces worker IDs, hashes, routes, and relay jargon at the primary level.

## Brain connection
The browser never becomes execution authority. Every substantive action goes through RuntimeRelay to the paired Mahoraga core, which chooses the capability lane, worker, agent, and repository path.

The UI may display a compact brain state: Ready, Connecting, Working, Waiting, or Needs attention. Advanced drill-down may show core capabilities and technical evidence.

## Repository changes
One-click repository actions are brain-routed objectives, not direct browser GitHub calls. The browser must never hold GitHub credentials or construct shell commands.

`Ship` sends an explicit owner intent through the existing conversation gateway to prepare/apply the current code update, run repository verification, create or update a branch/PR as appropriate, and merge only under the repository's normal verified policy. No Codex code review traffic is requested.

## Files and artifacts
Uploads remain bounded by the existing artifact policy. Until the core artifact bridge is live, the UI must say so plainly rather than pretend a file was sent. Produced artifacts should surface as open/download/save cards once the core returns them.

## Interaction layers
1. Primary: conversation, voice, upload, quick actions, live work card.
2. Detail: work progress, files/artifacts, approvals, handoff status.
3. Advanced: routes, workers, GitHub state, verification, repair, pairing evidence.

## Safety and authority
- GitHub `main` remains authoritative.
- Vercel remains non-blocking.
- Codex is not used for code review.
- Browser actions are bounded intents, never arbitrary command/shell/path input.
- Consequential repository release actions remain subject to core/repository confirmation and verification policy.
- No paid fallback is introduced.

## Success criteria
A user can open Mahoraga, understand whether the brain is connected, speak or type a request, invoke Build/Report/Handoff/Create/Ship in one click, continue steering work in chat, and see concise progress without understanding internal lanes. Technical detail is available only through drill-down.
