import { readFile } from 'node:fs/promises';

export async function publishRelease({ repository, token, tag, targetCommitish, title, body, prerelease, makeLatest, assets, fetchImpl = fetch }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(String(repository ?? '')) || !token) throw new Error('release-input-invalid');
  const headers = { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' };
  const releaseResponse = await fetchImpl('https://api.github.com/repos/' + repository + '/releases', { method: 'POST', headers, body: JSON.stringify({ tag_name: tag, target_commitish: targetCommitish, name: title, body, prerelease, make_latest: makeLatest }) });
  if (!releaseResponse.ok) throw new Error('release-create-' + releaseResponse.status);
  const release = await releaseResponse.json();
  const uploadUrl = String(release.upload_url ?? '').replace(/\{.*$/, '');
  for (const asset of assets) {
    const bytes = await readFile(asset.path);
    const response = await fetchImpl(uploadUrl + '?name=' + encodeURIComponent(asset.name), { method: 'POST', headers: { Accept: headers.Accept, Authorization: headers.Authorization, 'X-GitHub-Api-Version': headers['X-GitHub-Api-Version'], 'Content-Type': 'application/zip', 'Content-Length': String(bytes.length) }, body: bytes });
    if (!response.ok) throw new Error('release-upload-' + response.status + '-' + asset.name);
  }
  return Object.freeze({ id: release.id, url: release.html_url, tag });
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  const [tag, version, channel, commit, artifact, relayArtifact] = ['TAG', 'VERSION', 'CHANNEL', 'COMMIT', 'ARTIFACT', 'RELAY_ARTIFACT'].map((name) => process.env[name]);
  const updateManifest = 'dist/mahoraga-update.json';
  const result = await publishRelease({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN, tag, targetCommitish: commit, title: 'Mahoraga ' + version, body: 'Verified ' + channel + ' update. Eligible for verified local rollout with mandatory rollback evidence.', prerelease: channel === 'beta', makeLatest: channel === 'stable' ? 'true' : 'false', assets: [{ path: artifact, name: artifact.split('/').at(-1) }, { path: relayArtifact, name: relayArtifact.split('/').at(-1) }, { path: updateManifest, name: updateManifest.split('/').at(-1) }] });
  console.log(JSON.stringify(result));
}