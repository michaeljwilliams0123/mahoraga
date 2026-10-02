"use client";

export const PAGES_FRAME_CONTRACT = {
  mergedPullRequest: 949,
  mergedSha: "170e373af12efcfc6ee93570c63989a75005e0a9",
  bodyCapBytes: 32 * 1024,
  abortDeadlineSeconds: 60,
  authError: "owner-auth-required",
  trafficAuthority: false,
} as const;

export function PagesFrameContractCard() {
  return (
    <article className="eclipse-status-card neutral" aria-label="Native Pages iframe protocol">
      <span>Native Pages iframe protocol</span>
      <strong>Bounded / owner-auth</strong>
      <p>
        Observational #949 contract on the 7.0.0-alpha.2 cockpit. Exact action fields, protocol and request IDs, {PAGES_FRAME_CONTRACT.bodyCapBytes / 1024} KiB action body cap, {PAGES_FRAME_CONTRACT.abortDeadlineSeconds}s abort, no replay. HTTP 401/403 clears authentication and returns bounded {PAGES_FRAME_CONTRACT.authError}. Parent origin/source checks remain. Not a private owner-browser transaction and not traffic authority. SHA {PAGES_FRAME_CONTRACT.mergedSha.slice(0, 12)}.
      </p>
    </article>
  );
}
