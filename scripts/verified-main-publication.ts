import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const REPOSITORY = 'michaeljwilliams0123/mahoraga';
const OWNER = 'michaeljwilliams0123';
const BOT = 'github-actions[bot]';
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function validateVerifiedMainPublicationReceipt(value: unknown, run: Record<string, unknown>, expectedSha: string) {
 const receipt = record(value);
 const sourceRunId = receipt.sourceRunId;
 const sourceArtifactId = receipt.sourceArtifactId;
 const verifyRunId = receipt.verifyRunId;
 if (receipt.schemaVersion !== 1 || receipt.kind !== 'verified-main-publication-v1'
  || receipt.repository !== REPOSITORY
  || receipt.sourceWorkflow !== 'Autonomous Integration'
  || receipt.sourceWorkflowPath !== '.github/workflows/autonomous-integration.yml'
  || typeof sourceRunId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(sourceRunId)
  || typeof sourceArtifactId !== 'string' || !/^[1-9][0-9]{0,19}$/.test(sourceArtifactId)
  || !Number.isSafeInteger(receipt.pullRequest) || Number(receipt.pullRequest) < 1
  || typeof receipt.candidateHeadSha !== 'string' || !/^[a-f0-9]{40}$/.test(receipt.candidateHeadSha)
  || receipt.mergedSha !== expectedSha
  || typeof verifyRunId !== 'string' || verifyRunId !== String(run.id ?? '')
 ) throw new Error('verified-main-publication-receipt-invalid');
 return Object.freeze({
  sourceRunId,
  sourceArtifactId,
  pullRequest: Number(receipt.pullRequest),
  candidateHeadSha: receipt.candidateHeadSha,
  mergedSha: expectedSha,
  verifyRunId,
 });
}

/** A completed canonical verification grants publication only for its exact main source. */
export function verifiedMainPublication(value: unknown, expectedSha: string, receipt: unknown = null) {
 const run = record(value);
 const actor = record(run.actor).login;
 const ownerPermitted = actor === OWNER && (run.event === 'push' || run.event === 'workflow_dispatch');
 const botPushPermitted = actor === BOT && run.event === 'push';
 let botDispatchReceipt = null;
 if (actor === BOT && run.event === 'workflow_dispatch') {
  botDispatchReceipt = validateVerifiedMainPublicationReceipt(receipt, run, expectedSha);
 }
 const permitted = ownerPermitted || botPushPermitted || botDispatchReceipt !== null;
 if (run.name !== 'Verify Mahoraga' || run.path !== '.github/workflows/verify.yml'
  || run.status !== 'completed' || run.conclusion !== 'success' || run.head_branch !== 'main'
  || record(run.head_repository).full_name !== REPOSITORY || !permitted
  || typeof run.head_sha !== 'string' || !/^[a-f0-9]{40}$/.test(run.head_sha) || run.head_sha !== expectedSha) {
  throw new Error('verified-main-publication-denied');
 }
 return Object.freeze({
  sourceSha: run.head_sha,
  actor: actor as string,
  sourceEvent: run.event as string,
  trustSource: botDispatchReceipt ? 'autonomous-integration-receipt' : 'canonical-verification-event',
  ...(botDispatchReceipt ? { publicationReceipt: botDispatchReceipt } : {}),
 });
}

async function optionalBoundedReceipt(path: string | undefined) {
 if (!path) return null;
 const metadata = await stat(path);
 if (!metadata.isFile() || metadata.size < 2 || metadata.size > 32 * 1024) throw new Error('verified-main-publication-receipt-invalid');
 return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 if (process.env.GITHUB_EVENT_NAME !== 'workflow_run' || process.env.GITHUB_REPOSITORY !== REPOSITORY
  || !process.env.GITHUB_EVENT_PATH || !process.env.VERIFIED_SHA) throw new Error('verified-main-publication-denied');
 const metadata = await stat(process.env.GITHUB_EVENT_PATH);
 if (!metadata.isFile() || metadata.size > 1024 * 1024) throw new Error('verified-main-publication-denied');
 const event = record(JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8')) as unknown);
 const receipt = await optionalBoundedReceipt(process.env.VERIFIED_MAIN_PUBLICATION_RECEIPT);
 console.log(JSON.stringify(verifiedMainPublication(event.workflow_run, process.env.VERIFIED_SHA, receipt)));
}
