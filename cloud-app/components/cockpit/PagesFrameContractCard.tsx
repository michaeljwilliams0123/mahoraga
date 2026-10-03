"use client";

import { PAGES_FRAME_CONTRACT_SURFACE, pagesFrameContractDetail } from "@/lib/pages-frame-contract-surface";

export function PagesFrameContractCard() {
  return (
    <article className="eclipse-status-card neutral" aria-label="Native Pages iframe protocol">
      <span>Native Pages iframe protocol</span>
      <strong>Source-bound / observational</strong>
      <p>{pagesFrameContractDetail()} · canonical source {PAGES_FRAME_CONTRACT_SURFACE.sourcePath}</p>
    </article>
  );
}
