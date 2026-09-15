import assert from 'node:assert/strict';
import {fetch,ensureTestBrand} from './local-client.mjs';
await ensureTestBrand();const origin='http://localhost:3000';
const state=await (await fetch(origin+'/api/workspace')).json();const brand=state.brands[0];
async function post(path,body){const r=await fetch(origin+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};}
const created=await post('/api/workspace',{action:'createContent',data:{brandId:brand.id,title:'QA correction',brief:'Local test',date:'2030-01-10',format:'Feed',pillar:brand.pillars[0].name}});assert.equal(created.status,200);
const fresh=await (await fetch(origin+'/api/workspace')).json();const version=fresh.versions.find(v=>v.contentId===created.data.id);
let result=await post('/api/magnific',{action:'revise',contentId:created.data.id,format:'Feed',prompt:'Aumentar logo',expectedRevision:999,baseVersionId:version.id,assetIds:[]});assert.equal(result.status,400);assert.match(result.data.error,/pauta mudou/);
result=await post('/api/magnific',{action:'revise',contentId:created.data.id,format:'Feed',prompt:'Aumentar logo',expectedRevision:0,baseVersionId:version.id,assetIds:[]});assert.equal(result.status,400);assert.match(result.data.error,/versão atual com imagem/);
const asset=state.assets.find(a=>a.mime==='image/png');assert.ok(asset,'Local image fixture required');const image=await fetch(origin+asset.url+'?download=1');assert.equal(image.status,200);assert.match(image.headers.get('content-disposition'),/^attachment;/);assert.match(image.headers.get('content-disposition'),/\.png$/);assert.ok((await image.arrayBuffer()).byteLength>0);
console.log('Passed: stale revision rejection, missing base rejection, attachment download and file bytes');
