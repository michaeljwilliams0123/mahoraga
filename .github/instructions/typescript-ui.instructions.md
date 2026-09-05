---
applyTo: "cloud-app/**,operator-deck/**"
---

These trees are TypeScript. Keep `.ts` / `.tsx`.

- Do not convert files to `.js` or `.jsx`.
- Do not rewrite `cloud-app/` or `operator-deck/` as a JavaScript SPA.
- `cloud-app/` is the ChatGPT-style conversation workspace.
- `operator-deck/` is the operator console. It is not optional and must
  not be deleted because another prompt called `cloud-app/` the only UI.
- Follow `docs/ECOSYSTEM-LOCK.md` and `.github/copilot-instructions.md`.
- Do not activate Windows 7.0, fire Destiny, or spend Cloud Pro from UI work.
