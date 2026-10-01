type RecordValue = Record<string, unknown>;
type Result = Readonly<{ ok: boolean; reason: string | null; commitSha?: string }>;
const record = (value: unknown): RecordValue | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
const sha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
const identifier = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(value);
const result = (reason: string | null, commitSha?: string): Result => Object.freeze({ ok: reason === null, reason, ...(commitSha ? { commitSha } : {}) });
function fresh(value: unknown, now: number, age: number): boolean {
 const time = typeof value === "string" && value.length <= 64 ? Date.parse(value) : NaN;
 return Number.isFinite(time) && time <= now + 30_000 && time >= now - age;
}
function commands(value: unknown): string[] | null {
 if (!Array.isArray(value) || !value.length || value.length > 128) return null;
 const ids: string[] = [];
 for (const item of value) {
  const c = record(item);
  if (!c || !identifier(c.id) || !["success", "passed"].includes(String(c.conclusion))) return null;
  ids.push(c.id);
 }
 return new Set(ids).size === ids.length ? ids.sort() : null;
}
/** Secondary assurance never becomes source or deployment authority. Input must come from trusted observers. */
export function validateCurrentHeadAssurance(input: unknown, { now = Date.now(), maximumAgeMs = 300_000 }: { now?: number; maximumAgeMs?: number } = {}): Result {
 const root = record(input), main = record(root?.authoritativeMain), github = record(root?.github), gitlab = record(root?.gitlab);
 if (!Number.isFinite(now) || !Number.isSafeInteger(maximumAgeMs) || maximumAgeMs < 1 || maximumAgeMs > 900_000) return result("assurance-time-policy-invalid");
 if (!main || !sha(main.commitSha) || !identifier(main.repositoryIdentity) || !fresh(main.observedAt, now, maximumAgeMs)) return result("authoritative-main-unavailable");
 if (!github || !gitlab) return result("secondary-assurance-unavailable");
 if (github.commitSha !== main.commitSha || gitlab.commitSha !== main.commitSha) return result("secondary-assurance-stale-source");
 if (!fresh(github.observedAt, now, maximumAgeMs) || !fresh(gitlab.observedAt, now, maximumAgeMs)) return result("secondary-assurance-stale-observation");
 if ([github, gitlab].some(l => l.repositoryIdentity !== main.repositoryIdentity || l.branch !== "main" || !identifier(l.workflowVersion)) || github.workflowVersion !== gitlab.workflowVersion) return result("secondary-assurance-identity-mismatch");
 const a = commands(github.commands), b = commands(gitlab.commands);
 if (!a || !b || a.join("\n") !== b.join("\n")) return result("secondary-assurance-command-invalid");
 return result(null, main.commitSha);
}
/** Final pre-mutation check; labels cannot substitute for independently observed executor provenance. */
export function validatePromotionExecutor(input: unknown, { now = Date.now(), maximumAgeMs = 60_000 }: { now?: number; maximumAgeMs?: number } = {}): Result {
 const root = record(input), prior = record(root?.prior), current = record(root?.current);
 if (!root || !prior || !current || !sha(root.expectedSha) || !identifier(root.objectiveId) || !identifier(root.authorityVersion) || !Number.isFinite(now) || !Number.isSafeInteger(maximumAgeMs) || maximumAgeMs < 1 || maximumAgeMs > 300_000) return result("promotion-context-unavailable");
 for (const e of [prior, current]) {
  if (e.sourceSha !== root.expectedSha || e.objectiveId !== root.objectiveId || e.authorityVersion !== root.authorityVersion || e.independent !== true || e.health !== "healthy" || e.capability !== "cloudflare.deploy" || e.verifyConclusion !== "success" || !Number.isSafeInteger(e.verifyRunId) || Number(e.verifyRunId) <= 0 || !identifier(e.identity) || !identifier(e.deploymentId) || typeof e.provenanceDigest !== "string" || !/^[a-f0-9]{64}$/.test(e.provenanceDigest) || !Array.isArray(e.labels) || e.labels.length < 1 || e.labels.length > 16 || !e.labels.every(identifier) || new Set(e.labels).size !== e.labels.length) return result("promotion-executor-unverified");
  if (!fresh(e.observedAt, now, maximumAgeMs)) return result("promotion-executor-stale");
 }
 for (const field of ["identity", "provenanceDigest", "verifyRunId", "deploymentId"]) if (prior[field] !== current[field]) return result("promotion-executor-drift");
 if ([...(prior.labels as string[])].sort().join("\n") !== [...(current.labels as string[])].sort().join("\n")) return result("promotion-executor-drift");
 return result(null, root.expectedSha);
}
