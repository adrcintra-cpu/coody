import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePlanning,validatePlanning} from '../lib/ai-planning.ts';
const slots=[{brandId:'a',title:'Slot',date:'2030-01-01',pillar:'Produtos',brief:'base',objective:'base',format:'Feed + Story',status:'PLANEJADO'}];
const row={slot:0,title:'Produto real em uso',brief:'Mostrar benefícios cadastrados sem inventar características.',objective:'Reconhecimento',format:'Feed'};
const response=items=>({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({items})}]}]});
test('AI planning preserves controlled brand, dates and pillars while using generated text',()=>{const result=parsePlanning(response([row]),slots,[]);assert.equal(result[0].title,row.title);assert.equal(result[0].date,slots[0].date);assert.equal(result[0].brandId,'a');assert.equal(result[0].status,'PLANEJADO');});
test('Refusals, missing slots, duplicate themes and foreign dates are rejected',()=>{assert.throws(()=>parsePlanning({output:[]},slots,[]));assert.throws(()=>parsePlanning(response([]),slots,[]));assert.throws(()=>parsePlanning(response([row]),slots,[{title:row.title}]));const valid=parsePlanning(response([row]),slots,[]);assert.throws(()=>validatePlanning([{...valid[0],brandId:'b'}],slots,[]));assert.throws(()=>validatePlanning([{...valid[0],date:'2030-02-01'}],slots,[]));assert.throws(()=>validatePlanning(valid,[],[]));});
