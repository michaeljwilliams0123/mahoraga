import test from 'node:test';
import assert from 'node:assert/strict';
import { publishRelease } from '../scripts/publish-github-release.mjs';
const sha = 'a'.repeat(40); const next = 'b'.repeat(40);
const response = (status, body = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
test('does not create a release when main changed before creation', async () => {
  const calls=[]; const out=await publishRelease({repository:'owner/repo',token:'t',targetCommitish:sha,tag:'v1',title:'x',body:'x',assets:[],fetchImpl:async(url, init={})=>{calls.push([url,init.method]);return response(200,{object:{sha:next}});}});
  assert.equal(out.status,'stale-before-create'); assert.equal(calls.filter(([,method])=>method==='POST').length,0);
});
test('keeps draft unpublicized when main changes after draft creation', async () => {
  let reads=0; const calls=[]; const out=await publishRelease({repository:'owner/repo',token:'t',targetCommitish:sha,tag:'v1',title:'x',body:'x',assets:[],fetchImpl:async(url, init={})=>{calls.push([url,init.method]);if(url.includes('/git/ref/')) return response(200,{object:{sha: reads++ === 0 ? sha : next}});if(init.method==='POST') return response(201,{id:7,upload_url:'https://uploads.example/{?name}'});throw new Error('unexpected');}});
  assert.equal(out.status,'stale-before-publish'); assert.equal(calls.some(([,method])=>method==='PATCH'),false);
});
test('publishes only after repeated exact-head observations', async () => {
  const calls=[]; const out=await publishRelease({repository:'owner/repo',token:'t',targetCommitish:sha,tag:'v1',title:'x',body:'x',assets:[],fetchImpl:async(url, init={})=>{calls.push([url,init.method]);if(url.includes('/git/ref/')) return response(200,{object:{sha}});if(init.method==='POST') return response(201,{id:7,upload_url:'https://uploads.example/{?name}'});if(init.method==='PATCH') return response(200,{html_url:'https://example/release'});throw new Error('unexpected');}});
  assert.equal(out.published,true); assert.equal(out.status,'published-exact-head'); assert.equal(calls.at(-1)[1],'PATCH');
});