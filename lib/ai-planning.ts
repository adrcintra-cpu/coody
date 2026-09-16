import type {Content} from './types';
export type PlanningSlot=Omit<Content,'id'|'createdAt'>;
export const planningSchema={type:'object',additionalProperties:false,required:['items'],properties:{items:{type:'array',items:{type:'object',additionalProperties:false,required:['slot','title','brief','objective','format'],properties:{slot:{type:'integer'},title:{type:'string'},brief:{type:'string'},objective:{type:'string'},format:{type:'string',enum:['Feed','Story','Feed + Story']}}}}}};
export function parsePlanning(result:Record<string,unknown>,slots:PlanningSlot[],existing:Content[]){
 const output=result.output as {type?:string;content?:{type?:string;text?:string}[]}[]|undefined;
 const text=output?.filter(o=>o.type==='message').flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text||'').join('');
 let parsed:{items:Record<string,unknown>[]};try{parsed=JSON.parse(text||'');}catch{throw new Error('A IA não devolveu um planejamento válido. Tente novamente.');}
 if(!Array.isArray(parsed.items)||parsed.items.length!==slots.length)throw new Error('A IA devolveu uma quantidade diferente da meta.');
 const seen=new Set<number>();const rows=parsed.items.map(p=>{const i=p.slot;if(typeof i!=='number'||!Number.isInteger(i)||i<0||i>=slots.length||seen.has(i))throw new Error('A IA repetiu ou omitiu uma pauta.');seen.add(i);return {...slots[i],title:p.title,brief:p.brief,objective:p.objective,format:p.format};});
 return validatePlanning(rows,slots,existing);
}
export function validatePlanning(value:unknown,slots:PlanningSlot[],existing:Content[]):PlanningSlot[]{
 if(!Array.isArray(value)||value.length!==slots.length)throw new Error('A proposta ficou desatualizada. Gere novamente.');
 const pool=[...slots];const titles=new Set(existing.map(c=>c.title.trim().toLocaleLowerCase('pt-BR')));
 return value.map(p=>{if(!p||typeof p!=='object')throw new Error('Pauta inválida.');const i=pool.findIndex(s=>s.date===p.date&&s.pillar===p.pillar&&s.brandId===p.brandId);if(i<0)throw new Error('Datas ou pilares mudaram. Gere novamente.');const slot=pool.splice(i,1)[0];
 for(const [key,max] of [['title',200],['brief',6000],['objective',300]] as const)if(typeof p[key]!=='string'||!p[key].trim()||p[key].length>max)throw new Error('A proposta contém campos inválidos.');
 if(!['Feed','Story','Feed + Story'].includes(p.format))throw new Error('Formato inválido.');const title=p.title.trim();const key=title.toLocaleLowerCase('pt-BR');if(titles.has(key))throw new Error('A proposta repete um tema existente. Gere novamente.');titles.add(key);
 return {...slot,title,brief:p.brief.trim(),objective:p.objective.trim(),format:p.format,status:'PLANEJADO'};
 });
}
