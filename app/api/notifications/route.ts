import { activeState } from '@/lib/brand-lifecycle';
import { authorize } from '@/lib/auth';
import { database, readState } from '@/lib/repository';
import { statusLabels, type Status } from '@/lib/types';
export async function GET(request:Request){
 const user=await authorize(request);if(user instanceof Response)return user;
 try {
 const state=activeState(await readState(request));
 const alerts=await database().prepare('SELECT * FROM api_alerts WHERE workspaceId=? ORDER BY createdAt DESC LIMIT 20').bind(state.workspace!.id).all<{id:string;provider:string;message:string;createdAt:string}>();
 const reads=await database().prepare('SELECT notificationId FROM notification_reads WHERE userId=?').bind(user.id).all<{notificationId:string}>();
 const seen=new Set(reads.results.map(r=>r.notificationId));
 const items=[...alerts.results.map(a=>({id:a.id,title:a.provider,message:a.message,href:'#Integrações',createdAt:a.createdAt})),...state.contents.map(c=>({id:'content:'+c.id+':'+(c.revision||0),title:c.title,message:'Fase atual: '+(statusLabels[c.status as Status]||c.status),href:'#Studio?id='+c.id+'&month='+c.date.slice(0,7),createdAt:c.createdAt}))].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,50).map(i=>({...i,read:seen.has(i.id)}));
 return Response.json({items},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Não foi possível carregar notificações.'},{status:503});}
}
export async function POST(request:Request){
 const user=await authorize(request);if(user instanceof Response)return user;
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return new Response(null,{status:403});
 try{const {ids}=await request.json() as {ids:string[]};if(!Array.isArray(ids)||ids.length>50||ids.some(id=>typeof id!=='string'||id.length>150))throw new Error();
 if(ids.length)await database().batch(ids.map(id=>database().prepare('INSERT OR IGNORE INTO notification_reads (id,userId,notificationId) VALUES (?,?,?)').bind(user.id+':'+id,user.id,id)));
 return Response.json({ok:true});}catch{return Response.json({error:'Não foi possível marcar como lida.'},{status:400});}
}
