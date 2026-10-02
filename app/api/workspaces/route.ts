import { authorize } from '@/lib/auth';
import { database } from '@/lib/repository';
import { activeWorkspace, allowedWorkspaceIds } from '@/lib/workspaces';
import { can, deniedMessage } from '@/lib/permissions';
export async function POST(request:Request){
 const user=await authorize(request);if(user instanceof Response)return user;
 if(request.headers.get('origin') && request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Origem inválida.'},{status:403});
 try {
 const data=await request.json() as {action:string;id?:string;name?:string};
 let id='';
 if((data.action==='create'||data.action==='rename')&&!can(user.role,'manage'))throw new Error(deniedMessage('manage'));
 if(data.action==='create'){
 const name=typeof data.name==='string'?data.name.trim().slice(0,80):'';if(!name)throw new Error('Informe o nome do workspace.');
 id=crypto.randomUUID();await database().prepare('INSERT INTO workspaces (id,name,avatarUrl,createdAt) VALUES (?,?,?,?)').bind(id,name,'',new Date().toISOString()).run();
 } else if(data.action==='rename'){
 const current=await activeWorkspace(request);const name=typeof data.name==='string'?data.name.trim().slice(0,80):'';if(!name)throw new Error('Informe o nome.');
 await database().prepare('UPDATE workspaces SET name=? WHERE id=?').bind(name,current.id).run();return Response.json({ok:true});
 }else if(data.action==='select'){
 const allowed=await allowedWorkspaceIds(request);
 if(typeof data.id!=='string'||(allowed&&!allowed.includes(data.id))||!await database().prepare('SELECT id FROM workspaces WHERE id=?').bind(data.id).first())throw new Error('Workspace não encontrado.');id=data.id;
 }else throw new Error('Ação inválida.');
 return Response.json({ok:true,id},{headers:{'Set-Cookie':`coody_workspace=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${new URL(request.url).protocol==='https:'?'; Secure':''}`}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Não foi possível salvar.'},{status:400});}
}
