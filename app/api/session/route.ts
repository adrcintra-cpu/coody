import { env } from 'cloudflare:workers';
import { database } from '@/lib/repository';
import { checkPassword, signSession } from '@/lib/session';
export async function POST(request: Request) {
  const config = env as unknown as Record<string, string>;
  if (config.COODY_RUNTIME !== 'vercel') return new Response(null, {status:404});
  if (request.headers.get('origin') !== new URL(request.url).origin) return new Response(null, {status:403});
  if (!config.COODY_PASSWORD_HASH || !config.COODY_SESSION_SECRET || !config.COODY_OWNER_EMAIL) return Response.json({error:'Acesso ainda em configuração.'},{status:503});
  if (Number(request.headers.get('content-length') || 0) > 4096) return new Response(null,{status:413});
  const raw = await request.text();
  if (raw.length > 4096) return new Response(null,{status:413});
  let data: { email?: unknown; password?: unknown };
  try { data = JSON.parse(raw); } catch { return new Response(null,{status:400}); }
  if (typeof data.email !== 'string' || typeof data.password !== 'string') return new Response(null,{status:400});
  // Global owner limit cannot be bypassed by spoofing forwarded IP headers.
  const now = Math.floor(Date.now()/1000);
  const counter = await database().prepare('INSERT INTO login_attempts (id,attempts,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN expires<=? THEN 1 ELSE attempts+1 END, expires=CASE WHEN expires<=? THEN ? ELSE expires END RETURNING attempts').bind('owner',now+900,now,now,now+900).first<{attempts:number}>();
  if (!counter || counter.attempts > 10) return Response.json({error:'Muitas tentativas. Aguarde 15 minutos.'},{status:429,headers:{'Retry-After':'900'}});
  const valid = checkPassword(data.password, config.COODY_PASSWORD_HASH);
  if (!valid || data.email.trim().toLowerCase() !== config.COODY_OWNER_EMAIL.toLowerCase()) return Response.json({error:'E-mail ou senha incorretos.'},{status:401});
  await database().prepare('DELETE FROM login_attempts WHERE id=?').bind('owner').run();
  return Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':`coody_session=${signSession(config.COODY_OWNER_EMAIL,config.COODY_SESSION_SECRET)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`}});
}
export async function DELETE(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return new Response(null,{status:403});
  return Response.json({ok:true},{headers:{'Set-Cookie':'coody_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0','Cache-Control':'no-store'}});
}
