---
applyTo: "cloud-app/**,operator-deck/**"
---

These trees are TypeScript. Keep `.ts` / `.tsx`.

- Do not convert files to `.js` or `.jsx`.
- Do not rewrite `cloud-app/` or `operator-deck/` as a JavaScript SPA.
- `cloud-app/` is the one deployable browser UI source, published on GitHub Pages, and contains Chat,
  Control Center, Operations, and Connections.
- `operator-deck/` is a non-deployable TypeScript reference/control-library
  layer. Preserve its bounded helpers, but do not recreate a second browser app.
- Browser UI remains a client of the paired Mahoraga core. Do not add direct
  GitHub authority, direct provider selection, paid fallback, or automatic owner confirmation.
- Follow `docs/ECOSYSTEM-LOCK.md` and `.github/copilot-instructions.md`.
- Do not activate Windows 7.0, fire Destiny, or spend Cloud Pro from UI work.
