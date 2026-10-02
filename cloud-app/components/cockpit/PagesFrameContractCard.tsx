"use client";

export const PAGES_FRAME_CONTRACT = {
  mergedPullRequest: 949,
  mergedSha: "170e373af12efcfc6ee93570c63989a75005e0a9",
  bodyCapBytes: 32 * 1024,
  abortDeadlineSeconds: 60,
  authError: "cloud-owner-auth-required",
  trafficAuthority: false,
} as const;

export function PagesFrameContractCard() {
  return (
    <article className="eclipse-status-card neutral" aria-label="Native Pages iframe protocol">
      <span>Native Pages iframe protocol</span>
      <strong>Observational / bounded</strong>
      <p>
        #949 protocol v1 · action requests contain exactly protocolVersion, requestId, type, action, and payload · {PAGES_FRAME_CONTRACT.bodyCapBytes / 1024} KiB serialized action-body cap · {PAGES_FRAME_CONTRACT.abortDeadlineSeconds}-second abort · no replay. HTTP 401/403 clears frame authentication and returns bounded {PAGES_FRAME_CONTRACT.authError}. Parent origin/source checks remain. Observational only—not a private owner-browser transaction or traffic authority. SHA {PAGES_FRAME_CONTRACT.mergedSha.slice(0, 12)}.
      </p>
    </article>
  );
}
