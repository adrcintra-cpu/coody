import assert from 'node:assert/strict';
const origin='http://localhost:3000';
let workspace='';
async function call(path,body){const r=await fetch(origin+path,{method:body?'POST':'GET',headers:{Cookie:'__sites_local_auth=1'+(workspace?'; coody_workspace='+workspace:''),Origin:origin,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {r,data:await r.json()};}
const original=(await call('/api/workspace')).data;assert.equal(original.workspace.id,'main');
const created=await call('/api/workspaces',{action:'create',name:'QA isolated '+Date.now()});assert.equal(created.r.status,200);workspace=created.r.headers.get('set-cookie').match(/coody_workspace=([^;]+)/)[1];
const fresh=(await call('/api/workspace')).data;assert.equal(fresh.brands.length,0);assert.equal(fresh.contents.length,0);assert.equal(fresh.assets.length,0);assert.equal(fresh.workspace.id,workspace);
assert.equal((await call('/api/workspaces',{action:'rename',name:'QA Renamed'})).r.status,200);assert.equal((await call('/api/workspace')).data.workspace.name,'QA Renamed');
if(original.brands[0]){const bad=await call('/api/workspace',{action:'createContent',data:{brandId:original.brands[0].id,title:'Cross workspace',date:'2030-01-10',format:'Feed',pillar:original.brands[0].pillars[0].name}});assert.equal(bad.r.status,400);}
const brand=await call('/api/workspace',{action:'saveBrand',data:{name:'QA scoped',segment:'Tests',voice:'Clara',pillars:[{name:'Produtos',percent:100}]}});assert.equal(brand.r.status,200);
const content=await call('/api/workspace',{action:'createContent',data:{brandId:brand.data.id,title:'QA Notification',date:'2030-01-10',format:'Feed',pillar:'Produtos'}});assert.equal(content.r.status,200);
let notices=(await call('/api/notifications')).data.items;assert.equal(notices.length,1);assert.equal(notices[0].read,false);await call('/api/notifications',{ids:[notices[0].id]});assert.equal((await call('/api/notifications')).data.items[0].read,true);
await call('/api/workspace',{action:'status',data:{id:content.data.id,status:'EM CRIAÇÃO'}});notices=(await call('/api/notifications')).data.items;assert.equal(notices[0].read,false);assert.match(notices[0].message,/EM CRIAÇÃO/);
const otherId=workspace;workspace='';const restored=(await call('/api/workspace')).data;assert.equal(restored.brands.length,original.brands.length);assert.equal(restored.brands.some(b=>b.id===brand.data.id),false);assert.equal((await call('/api/notifications')).data.items.some(i=>i.title==='QA Notification'),false);
console.log(JSON.stringify({passed:true,workspace:otherId,checks:'create, rename, separation, cross-workspace rejection, phases, read persistence'}));
