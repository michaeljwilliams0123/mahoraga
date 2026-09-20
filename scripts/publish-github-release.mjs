import { readFile as defaultReadFile } from 'node:fs/promises';

export async function currentMainSha({ repository, token, fetchImpl = fetch }) {
  const response = await fetchImpl('https://api.github.com/repos/' + repository + '/git/ref/heads/main', { headers: githubHeaders(token) });
  if (!response.ok) throw codedError('release-main-read-' + response.status);
  const sha = (await response.json())?.object?.sha;
  if (!/^[a-f0-9]{40}$/i.test(String(sha ?? ''))) throw codedError('release-main-response-invalid');
  return String(sha).toLowerCase();
}

export async function publishRelease({ repository, token, tag, targetCommitish, title, body, prerelease, makeLatest, assets, fetchImpl = fetch, readFileImpl = defaultReadFile, now = () => new Date().toISOString() }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repository ?? '')) || !token || !/^[a-f0-9]{40}$/i.test(String(targetCommitish ?? ''))) throw codedError('release-input-invalid');
  const observedMainSha = await currentMainSha({ repository, token, fetchImpl });
  if (observedMainSha !== targetCommitish) return receipt('stale-before-create', { observedMainSha, targetCommitish, observedAt: now() });
  const releaseResponse = await fetchImpl('https://api.github.com/repos/' + repository + '/releases', { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify({ tag_name: tag, target_commitish: targetCommitish, name: title, body, prerelease, draft: true, make_latest: 'false' }) });
  if (!releaseResponse.ok) throw codedError('release-create-' + releaseResponse.status);
  const release = await releaseResponse.json();
  const uploadUrl = String(release.upload_url ?? '').replace(/\{.*$/, '');
  for (const asset of assets) {
    if (await currentMainSha({ repository, token, fetchImpl }) !== targetCommitish) return receipt('stale-before-asset-upload', { releaseId: release.id, targetCommitish, observedAt: now() });
    const bytes = await readFileImpl(asset.path);
    const response = await fetchImpl(uploadUrl + '?name=' + encodeURIComponent(asset.name), { method: 'POST', headers: { ...githubHeaders(token), 'Content-Type': 'application/zip', 'Content-Length': String(bytes.length) }, body: bytes });
    if (!response.ok) throw codedError('release-upload-' + response.status + '-' + asset.name);
  }
  const current = await currentMainSha({ repository, token, fetchImpl });
  if (current !== targetCommitish) return receipt('stale-before-publish', { releaseId: release.id, targetCommitish, observedMainSha: current, observedAt: now() });
  const publishResponse = await fetchImpl('https://api.github.com/repos/' + repository + '/releases/' + release.id, { method: 'PATCH', headers: jsonHeaders(token), body: JSON.stringify({ draft: false, make_latest: makeLatest }) });
  if (!publishResponse.ok) throw codedError('release-publish-' + publishResponse.status);
  return receipt('published-exact-head', { releaseId: release.id, url: (await publishResponse.json()).html_url, tag, targetCommitish, observedAt: now() });
}
function githubHeaders(token) { return { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28' }; }
function jsonHeaders(token) { return { ...githubHeaders(token), 'Content-Type': 'application/json' }; }
function receipt(status, details) { return Object.freeze({ schemaVersion: 1, kind: 'github-release-publication', published: status === 'published-exact-head', status, ...details }); }
function codedError(code) { const error = new Error(code); error.code = code; return error; }
if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const [tag, version, channel, commit, artifact, relayArtifact] = ['TAG', 'VERSION', 'CHANNEL', 'COMMIT', 'ARTIFACT', 'RELAY_ARTIFACT'].map((name) => process.env[name]);
  const result = await publishRelease({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN, tag, targetCommitish: commit, title: 'Mahoraga ' + version, body: 'Verified ' + channel + ' update. Eligible for verified local rollout with mandatory rollback evidence.', prerelease: channel === 'beta', makeLatest: channel === 'stable' ? 'true' : 'false', assets: [{ path: artifact, name: artifact.split('/').at(-1) }, { path: relayArtifact, name: relayArtifact.split('/').at(-1) }, { path: 'dist/mahoraga-update.json', name: 'mahoraga-update.json' }] });
  console.log(JSON.stringify(result));
  if (!result.published) process.exitCode = 1;
}