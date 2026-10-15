const SHA = /^[a-f0-9]{40}$/;
const REPO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}\/[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/;
export type CloudflareHfCandidate = {
  repoId: string; revision: string; license: string; downloads: number;
  admissionState: "requires-independent-inspection"; modelExecutionVerified: false;
};
export function selectCloudflareHfCandidates(raw: unknown): CloudflareHfCandidate[] {
  if (!Array.isArray(raw) || raw.length > 20) throw Error("hf-cloud-metadata-invalid");
  return raw.flatMap(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const item = value as Record<string, unknown>;
    const card = item.cardData && typeof item.cardData === "object" && !Array.isArray(item.cardData)
      ? item.cardData as Record<string, unknown> : {};
    const repoId = item.id, revision = item.sha;
    const licenseTag = Array.isArray(item.tags)
      ? item.tags.find(tag => typeof tag === "string" && /^license:[a-z0-9][a-z0-9._+-]{0,63}$/.test(tag))
      : undefined;
    const license = typeof card.license === "string" ? card.license
      : typeof licenseTag === "string" ? licenseTag.slice("license:".length) : undefined;
    if (typeof repoId !== "string" || !REPO.test(repoId) || typeof revision !== "string" || !SHA.test(revision)
      || item.private === true || item.gated !== false || typeof license !== "string"
      || !/^[a-z0-9][a-z0-9._+\-]{0,63}$/.test(license)) return [];
    const downloads = Number.isSafeInteger(item.downloads) && Number(item.downloads) >= 0 ? Number(item.downloads) : 0;
    return [{ repoId, revision, license, downloads,
      admissionState: "requires-independent-inspection" as const, modelExecutionVerified: false as const }];
  }).sort((a, b) => b.downloads - a.downloads || a.repoId.localeCompare(b.repoId)).slice(0, 6);
}

export type HfDiscoveryFailure = "upstream-http" | "body-too-large" | "body-unavailable" |
  "invalid-json" | "invalid-metadata" | "no-eligible-models" | "timeout" | "network-error";

/** Fixed reason codes only; never store upstream response bodies, URLs or exception messages. */
export function classifyHfDiscoveryFailure(error: unknown): HfDiscoveryFailure {
  if (!(error instanceof Error)) return "network-error";
  if (error.message === "hf-cloud-upstream-unavailable") return "upstream-http";
  if (error.message === "hf-cloud-body-too-large") return "body-too-large";
  if (error.message === "hf-cloud-body-unavailable") return "body-unavailable";
  if (error.message === "hf-cloud-metadata-invalid") return "invalid-metadata";
  if (error.message === "hf-cloud-no-eligible-models") return "no-eligible-models";
  if (error.name === "SyntaxError") return "invalid-json";
  if (error.name === "TimeoutError" || error.name === "AbortError") return "timeout";
  return "network-error";
}
