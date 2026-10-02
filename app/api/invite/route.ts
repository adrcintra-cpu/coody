import { env } from 'cloudflare:workers';
import { database } from '@/lib/repository';
import { hashPassword, signSession } from '@/lib/session';
import { inviteByToken, memberById, tokenHash } from '@/lib/members';

/** Public: who the invite is for (name, e-mail), if the link is still valid. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || '';
  const invite = await inviteByToken(token).catch(() => null);
  if (!invite)
    return Response.json({ error: 'Este convite expirou ou já foi usado. Peça um novo link ao administrador.' }, { status: 404 });
  return Response.json({ name: invite.name, email: invite.email }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Public: set the password, activate the access and sign in. */
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  const config = env as unknown as Record<string, string>;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return new Response(null, { status: 413 });
    const data = JSON.parse(raw) as { token?: unknown; password?: unknown; name?: unknown };
    const token = typeof data.token === 'string' ? data.token : '';
    const password = typeof data.password === 'string' ? data.password : '';
    if (password.length < 8 || password.length > 256)
      throw new Error('Use uma senha com pelo menos 8 caracteres.');
    const invite = await inviteByToken(token);
    if (!invite) throw new Error('Este convite expirou ou já foi usado. Peça um novo link ao administrador.');
    const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 120) : invite.name;
    const now = new Date().toISOString();
    const used = await database()
      .prepare('UPDATE member_invites SET usedAt=? WHERE tokenHash=? AND usedAt IS NULL')
      .bind(now, tokenHash(token))
      .run();
    if (!used.meta.changes) throw new Error('Este convite já foi usado.');
    await database()
      .prepare("UPDATE members SET passwordHash=?, name=?, status='active', sessionVersion=sessionVersion+1, updatedAt=? WHERE id=?")
      .bind(hashPassword(password), name, now, invite.memberId)
      .run();
    const member = await memberById(invite.memberId);
    if (!member) throw new Error('Convite inválido.');
    const session = signSession(member.email, config.COODY_SESSION_SECRET, Date.now(), { uid: member.id, ver: member.sessionVersion });
    return Response.json(
      { ok: true },
      { headers: { 'Cache-Control': 'no-store', 'Set-Cookie': `coody_session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200` } },
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error && !/SQLITE/.test(error.message) ? error.message : 'Não foi possível ativar o acesso.' }, { status: 400 });
  }
}
