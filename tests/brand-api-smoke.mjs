import assert from 'node:assert/strict';
const origin='http://localhost:3000';
const snapshot=async()=>{const r=await fetch(origin+'/api/workspace');assert.equal(r.status,200);return r.json()};
const before=await snapshot();
const id=crypto.randomUUID();
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG2cAAAAASUVORK5CYII=','base64');
async function onboarding(brandId,valid=true){const f=new FormData();f.set('payload',JSON.stringify({id:brandId,brand:{name:'QA arquitetura '+brandId,segment:'Teste',voice:'Direto',instagram:'@qa',rules:'Preservar identidade'},assets:[{name:'Logo QA',category:'logo',description:'Identidade oficial',aiNotes:'Preservar proporções',priority:true}]}));f.append('files',new Blob([valid?png:'invalid'],{type:'image/png'}),'logo.png');const r=await fetch(origin+'/api/brands',{method:'POST',body:f});const data=await r.json();assert.equal(r.status,valid?200:400,JSON.stringify(data));return data;}
async function post(action,data,expected=200){const r=await fetch(origin+'/api/workspace',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({action,data})});const body=await r.json();assert.equal(r.status,expected,JSON.stringify(body));return body;}
const invalid=crypto.randomUUID();await onboarding(invalid,false);assert.equal((await snapshot()).brands.some(b=>b.id===invalid),false);
await onboarding(id);await onboarding(id);
let state=await snapshot();assert.equal(state.brands.filter(b=>b.id===id).length,1);const own=state.assets.filter(a=>a.brandId===id);assert.equal(own.length,1);const a=own[0];assert.equal(a.description,'Identidade oficial');assert.equal(a.aiNotes,'Preservar proporções');assert.equal(a.priority,1);assert.equal(a.category,'logo');assert.equal(state.brands.find(b=>b.id===id).rules,'Preservar identidade');
await post('saveAsset',{id:a.id,brandId:before.brands[0].id,name:'Invasão',category:'material'},400);
await post('saveAsset',{id:a.id,brandId:id,name:'Logo revisado',category:'logo',description:'Descrição revisada',aiNotes:'Não distorcer',priority:false});
const form=new FormData();form.set('brandId','all');form.set('file',new Blob([png],{type:'image/png'}),'file.png');const wrong=await fetch(origin+'/api/assets',{method:'POST',body:form});assert.equal(wrong.status,400);
state=await snapshot();assert.equal(state.assets.find(x=>x.id===a.id).aiNotes,'Não distorcer');
for(const original of before.brands)assert.deepEqual(state.brands.find(b=>b.id===original.id),original);
console.log(JSON.stringify({passed:true,qaBrandId:id,verified:['cadastro com arquivos','repetição sem duplicação','falha sem cadastro parcial','edição dos metadados','isolamento por marca','rejeição de todas as marcas','preservação dos cadastros']}));
