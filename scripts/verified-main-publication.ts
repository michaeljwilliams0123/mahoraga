import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const REPOSITORY = 'michaeljwilliams0123/mahoraga';
const OWNER = 'michaeljwilliams0123';
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** A completed canonical verification grants publication only for its exact main source. */
export function verifiedMainPublication(value: unknown, expectedSha: string) {
 const run = record(value);
 const actor = record(run.actor).login;
 const permitted = (actor === OWNER && (run.event === 'push' || run.event === 'workflow_dispatch'))
  || (actor === 'github-actions[bot]' && (run.event === 'push' || run.event === 'workflow_dispatch'));
 if (run.name !== 'Verify Mahoraga' || run.path !== '.github/workflows/verify.yml'
  || run.status !== 'completed' || run.conclusion !== 'success' || run.head_branch !== 'main'
  || record(run.head_repository).full_name !== REPOSITORY || !permitted
  || typeof run.head_sha !== 'string' || !/^[a-f0-9]{40}$/.test(run.head_sha) || run.head_sha !== expectedSha) {
  throw new Error('verified-main-publication-denied');
 }
 return { sourceSha: run.head_sha, actor: actor as string, sourceEvent: run.event as string };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 if (process.env.GITHUB_EVENT_NAME !== 'workflow_run' || process.env.GITHUB_REPOSITORY !== REPOSITORY
  || !process.env.GITHUB_EVENT_PATH || !process.env.VERIFIED_SHA) throw new Error('verified-main-publication-denied');
 const metadata = await stat(process.env.GITHUB_EVENT_PATH);
 if (!metadata.isFile() || metadata.size > 1024 * 1024) throw new Error('verified-main-publication-denied');
 const event = record(JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8')) as unknown);
 console.log(JSON.stringify(verifiedMainPublication(event.workflow_run, process.env.VERIFIED_SHA)));
}
