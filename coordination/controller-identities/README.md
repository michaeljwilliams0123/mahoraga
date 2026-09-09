# Primary Codex identity handshakes

Each JSON record in this directory is a public, self-signed Codex identity plus
a signed handshake bound to this repository and a known base commit. The private
Ed25519 key stays outside Git under `~/.mahoraga/codex-identities`.

The cryptographic instance ID distinguishes two Codex installations even when
they use the same GitHub actor. `equal-primary-controller-v1` grants the same
repository-side controller capabilities, verification duties, and integration
lease rules; it does **not** manufacture GitHub credentials or alter GitHub App,
team, or branch-protection settings. Those permissions must be granted to the
actor or App in GitHub and verified separately.

```bash
node scripts/codex-github-handshake.mjs enroll --label "Codex Workspace Primary"
node scripts/codex-github-handshake.mjs verify --file coordination/controller-identities/<instance-id>.json
```

Merging the public record through the protected repository path makes the
handshake repository-recognized. A local file or unmerged branch alone is not
proof that GitHub accepted it.
