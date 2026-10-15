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
    const repoId = item.id, revision = item.sha, license = card.license;
    if (typeof repoId !== "string" || !REPO.test(repoId) || typeof revision !== "string" || !SHA.test(revision)
      || item.private === true || item.gated !== false || typeof license !== "string"
      || !/^[a-z0-9][a-z0-9._+\-]{0,63}$/.test(license)) return [];
    const downloads = Number.isSafeInteger(item.downloads) && Number(item.downloads) >= 0 ? Number(item.downloads) : 0;
    return [{ repoId, revision, license, downloads,
      admissionState: "requires-independent-inspection" as const, modelExecutionVerified: false as const }];
  }).sort((a, b) => b.downloads - a.downloads || a.repoId.localeCompare(b.repoId)).slice(0, 6);
}
