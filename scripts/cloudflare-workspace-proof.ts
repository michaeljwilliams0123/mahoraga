import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeWorkspaceOrigin } from '../deploy/cloudflare-owner-gateway/workspace-origins.ts';
import { waitForExactRuntimeConvergence } from './cloudflare-execution-runtime.ts';

export const WORKSPACE_URL = 'https://mahoraga-workspace-candidate.mahoraga-mjw0123.workers.dev';
export const BRIDGE_ORIGIN = 'https://mahoraga-owner-gateway.mahoraga-mjw0123.workers.dev';
const record = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const validSha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
export function verifiedWorkspacePublication(value: unknown, expectedSha: string) {
 const run = record(value), actor = record(run.actor).login;
 const permitted = (actor === 'michaeljwilliams0123' && (run.event === 'workflow_run' || run.event === 'workflow_dispatch'))
  || (actor === 'github-actions[bot]' && run.event === 'workflow_run');
 if (run.name !== 'Deploy and Accept Exact Main on Cloudflare' || run.path !== '.github/workflows/cloudflare-execution-runtime.yml'
  || run.status !== 'completed' || run.conclusion !== 'success' || run.head_branch !== 'main'
  || record(run.head_repository).full_name !== 'michaeljwilliams0123/mahoraga' || !permitted
  || !validSha(run.head_sha) || run.head_sha !== expectedSha) throw new Error('workspace-publication-denied');
 return { sourceSha: run.head_sha, sourceEvent: run.event, actor };
}
export function workspaceSecurityHeaders(bridgeOrigin = BRIDGE_ORIGIN): string {
 const origin = normalizeWorkspaceOrigin(bridgeOrigin);
 if (!origin) throw new Error('workspace-bridge-origin-invalid');
 return `/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), geolocation=(), payment=(), usb=()\n  Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob:; connect-src 'self' https://mahoraga-relay.mahoraga-mjw0123.workers.dev wss://mahoraga-relay.mahoraga-mjw0123.workers.dev; frame-src ${origin}; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'\n/api/health.json\n  Cache-Control: no-store\n`;
}
export function validateWorkspaceCandidate(input: { sha: string; html: string; health: unknown; headers: Headers }) {
 const health = record(input.health), deployment = record(health.deployment), h = input.headers;
 if (!validSha(input.sha) || !input.html.includes('/_next/static/') || /http-equiv=["']refresh|location\.replace\(/i.test(input.html)
  || health.product !== 'Mahoraga' || deployment.provider !== 'cloudflare-workers' || deployment.environment !== 'candidate'
  || deployment.commitSha !== input.sha || deployment.promotion !== 'unverified-cloudflare-static'
  || h.get('server')?.toLowerCase() !== 'cloudflare' || !h.get('cf-ray') || h.get('x-content-type-options') !== 'nosniff'
  || !h.get('content-type')?.includes('text/html') || h.get('x-frame-options') !== 'DENY' || h.get('referrer-policy') !== 'no-referrer'
  || h.get('content-security-policy')?.trim() !== workspaceSecurityHeaders().split('Content-Security-Policy: ')[1]?.split('\n')[0]) throw new Error('workspace-candidate-unverified');
 return { schemaVersion: 1, status: 'verified-candidate', targetSha: input.sha, workspaceUrl: WORKSPACE_URL,
  staticSourceVerified: true, executionAuthorityGranted: false } as const;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const sha = process.env.VERIFIED_SHA;
 if (!validSha(sha)) throw new Error('workspace-publication-denied');
 if (process.argv[2] === 'accept') {
  let receipt: ReturnType<typeof validateWorkspaceCandidate> | undefined;
  for (let attempt = 0; attempt < 10; attempt++) {
   try {
    const html = await fetch(`${WORKSPACE_URL}/`, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const metadata = await fetch(`${WORKSPACE_URL}/api/health.json`, { redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!html.ok || !metadata.ok || metadata.headers.get('cache-control') !== 'no-store') throw new Error('workspace-candidate-unverified');
    const text = await html.text(), json = await metadata.text();
    if (text.length > 2 * 1024 * 1024 || json.length > 65536) throw new Error('workspace-candidate-unverified');
    receipt = validateWorkspaceCandidate({ sha, html: text, health: JSON.parse(json) as unknown, headers: html.headers });
    break;
   } catch { if (attempt === 9) throw new Error('workspace-candidate-unverified'); await new Promise(done => setTimeout(done, 3000)); }
  }
  if (!receipt) throw new Error('workspace-candidate-unverified');
  await waitForExactRuntimeConvergence({ targetSha: sha,
   fetchImpl: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10000) }),
   ...(process.env.CLOUDFLARE_ACCESS_TOKEN ? { accessToken: process.env.CLOUDFLARE_ACCESS_TOKEN } : {}),
   ...(process.env.CLOUDFLARE_ACCESS_CLIENT_ID ? { accessClientId: process.env.CLOUDFLARE_ACCESS_CLIENT_ID } : {}),
   ...(process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET ? { accessClientSecret: process.env.CLOUDFLARE_ACCESS_CLIENT_SECRET } : {}),
   readyAttempts: 10, readyDelayMs: 3000 });
  const result = { ...receipt, pairedRuntimeSourceVerified: true, observedAt: new Date().toISOString() };
  const output = process.argv[3];
  if (output) { await mkdir(dirname(output), { recursive: true }); await writeFile(output, `${JSON.stringify(result, null, 2)}\n`); }
  console.log(JSON.stringify(result));
 } else {
  if (process.env.GITHUB_EVENT_NAME !== 'workflow_run' || process.env.GITHUB_REPOSITORY !== 'michaeljwilliams0123/mahoraga' || !process.env.GITHUB_EVENT_PATH) throw new Error('workspace-publication-denied');
  const metadata = await stat(process.env.GITHUB_EVENT_PATH);
  if (!metadata.isFile() || metadata.size > 1024 * 1024) throw new Error('workspace-publication-denied');
  const event = record(JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8')) as unknown);
  console.log(JSON.stringify(verifiedWorkspacePublication(event.workflow_run, sha)));
 }
}
