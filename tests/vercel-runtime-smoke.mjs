import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { createClient } from '@libsql/client';
import { del } from '@vercel/blob';
Object.assign(process.env,JSON.parse(readFileSync('outputs/vercel-auth.json','utf8')));
const handler=(await import('../.vercel/output/functions/__server.func/index.mjs')).default;
const origin='https://coody.test';
let cookie='';
async function request(path,options={}) {const headers=new Headers(options.headers);headers.set('Origin',origin);if(cookie)headers.set('Cookie',cookie);return handler.fetch(new Request(origin+path,{...options,headers}),{});}
const spoofed=await request('/api/workspace',{headers:{'oai-authenticated-user-email':process.env.COODY_OWNER_EMAIL,'oai-authenticated-user-id':'owner'}});
assert.equal(spoofed.status,401,'forged Sites headers must not authenticate');
const password=readFileSync('outputs/COODY-acesso-Vercel.txt','utf8').split('Senha: ')[1].trim();
const login=await request('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.COODY_OWNER_EMAIL,password})});
assert.equal(login.status,200,await login.clone().text());cookie=login.headers.get('set-cookie').split(';')[0];
assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
let response=await request('/api/workspace');assert.equal(response.status,200,await response.clone().text());
const state=await response.json();assert.equal(state.brands.length,0,'fresh database');assert.equal(state.contents.length,0);
const db=createClient({url:process.env.TURSO_DATABASE_URL,authToken:process.env.TURSO_AUTH_TOKEN});
let brandId,assetId;
try {
 response=await request('/api/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'saveBrand',data:{name:'QA Vercel temporário',segment:'Teste técnico',voice:'Clara',pillars:[{name:'Produtos',percent:100}]}})});
 assert.equal(response.status,200,await response.clone().text());brandId=(await response.json()).id;assert.ok(brandId);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG2cAAAAASUVORK5CYII=','base64');
 const form=new FormData();form.set('brandId',brandId);form.set('category','Referências visuais');form.set('file',new Blob([png],{type:'image/png'}),'qa.png');
 response=await request('/api/assets',{method:'POST',body:form});assert.equal(response.status,200,await response.clone().text());assetId=(await response.json()).id;
 response=await request('/api/assets/'+assetId+'?download=1');assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/attachment/);assert.deepEqual(Buffer.from(await response.arrayBuffer()),png);
 response=await request('/api/session',{method:'DELETE'});assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/Max-Age=0/);
 cookie='';response=await request('/api/assets/'+assetId);assert.equal(response.status,401);
 console.log('PASS: login, forged-header rejection, empty state, brand persistence, private upload/download and logout.');
} finally {
 if(assetId) {await del('brands/'+brandId+'/'+assetId);await db.execute({sql:'DELETE FROM brand_assets WHERE id=?',args:[assetId]});}
 if(brandId) {await db.execute({sql:'DELETE FROM brand_guidelines WHERE brandId=?',args:[brandId]});await db.execute({sql:'DELETE FROM brands WHERE id=?',args:[brandId]});}
 db.close();
}
