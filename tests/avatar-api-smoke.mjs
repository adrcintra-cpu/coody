import assert from 'node:assert/strict';
import { fetch, ensureTestBrand } from './local-client.mjs';
await ensureTestBrand();
const origin = 'http://localhost:3000';
const before = await (await fetch(origin+'/api/workspace')).json();
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG2cAAAAASUVORK5CYII=','base64');
for(const kind of ['brand','user']) {
 const form=new FormData();form.set('kind',kind);form.set('brandId',before.brands[0].id);form.set('file',new Blob([png],{type:'image/png'}),'profile.png');
 const response=await fetch(origin+'/api/avatars',{method:'POST',body:form});
 const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));
 const state=await (await fetch(origin+'/api/workspace')).json();
 assert.equal(kind==='brand'?state.brands[0].avatarUrl:state.user.avatarUrl,result.url);
 const image=await fetch(origin+result.url);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/png');
 assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
 assert.equal(state.assets.length,before.assets.length,'Profile photos must not enter creative library');
}
const bad=new FormData();bad.set('kind','user');bad.set('file',new Blob(['fake'],{type:'image/png'}),'fake.png');
assert.equal((await fetch(origin+'/api/avatars',{method:'POST',body:bad})).status,400);
assert.equal((await fetch(origin+'/api/avatars',{method:'POST',headers:{Origin:'https://invalid.example'},body:bad})).status,403);
console.log('Avatar upload, persistence, retrieval, isolation and invalid input checks passed');
