# Staged cloud update channel

Mahoraga publishes versioned update archives through an owner-started GitHub
workflow. The update lane is deterministic and does not invoke Codex.

Every release requires the complete repository verification suite and contains:

- an archive created from the immutable `main` commit;
- `mahoraga-update.json` with the version, channel, commit, byte size, and SHA-256;
- GitHub artifact provenance for both files; and
- an activation policy fixed to `verified-auto-local`, `mahoraga`, with rollback required.

Stable and beta are separate channels. Publishing a release does not install,
extract, or activate anything on a Windows machine. The desktop continues to
receive ordinary source changes through Git, and a later outbound update client
may download a release only into ignored runtime staging after validating this
contract. The local runtime may then activate it automatically after checkpointing the prior release and must restore that checkpoint if verification fails.

The workflow accepts no caller-selected source branch, tag, artifact path,
executable, API key, or deployment endpoint. Only the repository owner can
start it, and every remote Action is pinned to an immutable commit.
