import test from 'node:test';
import assert from 'node:assert/strict';
import {openaiRequest,parseCreative} from '../lib/openai-client.ts';
test('OpenAI quota and rate limit are distinct and secrets stay out of errors',async()=>{
 for(const [code,pattern] of [['insufficient_quota',/Créditos/],['rate_limit_exceeded',/temporariamente/]]) {
  await assert.rejects(()=>openaiRequest('secret','responses',{},async()=>Response.json({error:{code,message:'secret'}},{status:429})),pattern);
 }
});
test('OpenAI requests use fixed origin, server auth, manual redirects and no retry',async()=>{
 let calls=0;
 await assert.rejects(()=>openaiRequest('secret','responses',{},async(url,options)=>{
  calls++;
  assert.equal(url,'https://api.openai.com/v1/responses');
  assert.equal(options.headers.Authorization,'Bearer secret');
  assert.equal(options.redirect,'manual');
  return new Response('',{status:302});
 }),/não concluiu/);
 assert.equal(calls,1);
});
test('Creative parsing accepts structured text and rejects refusals and invalid hashtags',()=>{
 const value={headline:'Headline',copy:'Texto',caption:'Legenda',hashtags:['#Um','#Dois','#Três','#Quatro','#Cinco'],visualPrompt:'Composição'};
 const wrap=v=>({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(v)}]}]});
 assert.deepEqual(parseCreative(wrap(value)),value);
 assert.throws(()=>parseCreative({output:[{type:'message',content:[{type:'refusal'}]}]}));
 assert.throws(()=>parseCreative(wrap({...value,hashtags:['#Um','#um','#Três','#Quatro','#Cinco']})));
 assert.throws(()=>parseCreative(wrap({...value,caption:''})));
});
