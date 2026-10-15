export function SourceFileInspectCard() {
  return (
    <article className="eclipse-status-card neutral" data-testid="source-file-inspect">
      <span>GitHub source-file inspect</span>
      <strong>Allowlisted exact-SHA (observational)</strong>
      <p>
        Merged #1102 adds owner-authenticated /repo file &lt;path&gt; for four reviewed paths (src/repository-chat-intent.mjs, src/github-native-client.mjs, deploy/cloudflare-execution-runtime/worker.ts, deploy/cloudflare-execution-runtime/provider-invoker.ts). Reads authoritative refs/heads/main at exact immutable commit SHA via GitHub Contents API. Max 64 KB, 4000-char excerpt, strict checks, credential rejection. Includes main SHA, runtime SHA parity, path, blob SHA, size, truncated flag. repository.inspect capability only; distinct source-file receipt. No mutations, no free-form browsing. Product remains Mahoraga. 7.0.0-alpha.2 is build provenance only. This surface is not execution readiness, cognition proof, or production traffic authority.
      </p>
    </article>
  );
}
