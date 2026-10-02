import { env } from 'cloudflare:workers';
import { authorize } from '@/lib/auth';
import { database } from '@/lib/repository';
import { can, deniedMessage, isRole } from '@/lib/permissions';
import { createInvite, ensureMembers, INVITE_DAYS, memberByEmail, memberById } from '@/lib/members';

/** Pessoas: administrators list, invite, change and remove people. */
async function admin(request: Request) {
  const user = await authorize(request);
  if (user instanceof Response) return user;
  if (!can(user.role, 'manage'))
    return Response.json({ error: deniedMessage('manage') }, { status: 403 });
  return user;
}
const ownerEmail = () =>
  String((env as unknown as Record<string, unknown>).COODY_OWNER_EMAIL || '').trim().toLowerCase();

export async function GET(request: Request) {
  const user = await admin(request);
  if (user instanceof Response) return user;
  try {
    await ensureMembers();
    const db = database();
    const [members, links, invites, workspaces] = await db.batch([
      db.prepare('SELECT id,email,name,role,status,createdAt FROM members ORDER BY createdAt'),
      db.prepare('SELECT memberId,workspaceId FROM member_workspaces'),
      db.prepare('SELECT memberId,expiresAt FROM member_invites WHERE usedAt IS NULL'),
      db.prepare('SELECT id,name FROM workspaces ORDER BY createdAt,id'),
    ]);
    const link = links.results as { memberId: string; workspaceId: string }[];
    const inv = invites.results as { memberId: string; expiresAt: string }[];
    return Response.json(
      {
        owner: ownerEmail(),
        workspaces: workspaces.results,
        members: (members.results as Record<string, string>[]).map((m) => ({
          ...m,
          workspaceIds: link.filter((l) => l.memberId === m.id).map((l) => l.workspaceId),
          inviteExpiresAt: inv.find((i) => i.memberId === m.id)?.expiresAt || '',
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json({ error: 'Não foi possível carregar as pessoas.' }, { status: 503 });
  }
}

/** invite {name,email,role,workspaceIds} · update {id,role,workspaceIds} ·
 *  relink {id} · disable {id} · enable {id} · remove {id} */
export async function POST(request: Request) {
  const user = await admin(request);
  if (user instanceof Response) return user;
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  try {
    await ensureMembers();
    const db = database();
    const data = (await request.json()) as Record<string, unknown>;
    const now = new Date().toISOString();
    const origin = new URL(request.url).origin;
    const workspaceIds = async () => {
      const list = Array.isArray(data.workspaceIds)
        ? [...new Set(data.workspaceIds.filter((x): x is string => typeof x === 'string'))]
        : [];
      if (!list.length) throw new Error('Libere ao menos um workspace.');
      const known = (await db.prepare('SELECT id FROM workspaces').all<{ id: string }>()).results.map((w) => w.id);
      if (list.some((id) => !known.includes(id))) throw new Error('Workspace inválido.');
      return list;
    };
    const setLinks = (id: string, list: string[]) => [
      db.prepare('DELETE FROM member_workspaces WHERE memberId=?').bind(id),
      ...list.map((w) => db.prepare('INSERT INTO member_workspaces (memberId,workspaceId) VALUES (?,?)').bind(id, w)),
    ];
    const inviteLink = (token: string) => origin + '/#convite?token=' + token;

    if (data.action === 'invite') {
      const name = typeof data.name === 'string' ? data.name.trim().slice(0, 120) : '';
      const email = typeof data.email === 'string' ? data.email.trim().toLowerCase().slice(0, 200) : '';
      if (!name) throw new Error('Informe o nome da pessoa.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');
      if (email === ownerEmail()) throw new Error('Este e-mail já é o administrador principal.');
      if (await memberByEmail(email)) throw new Error('Esta pessoa já foi convidada. Gere um novo link na lista.');
      if (!isRole(data.role)) throw new Error('Escolha o perfil de acesso.');
      const list = await workspaceIds();
      const id = crypto.randomUUID();
      await db.batch([
        db.prepare("INSERT INTO members (id,email,name,role,status,createdAt,updatedAt) VALUES (?,?,?,?,'invited',?,?)").bind(id, email, name, data.role, now, now),
        ...setLinks(id, list),
      ]);
      const invite = await createInvite(id);
      return Response.json({ ok: true, id, link: inviteLink(invite.token), expiresAt: invite.expires, days: INVITE_DAYS });
    }
    const member = typeof data.id === 'string' ? await memberById(data.id) : null;
    if (!member) throw new Error('Pessoa não encontrada.');
    // Any change of access ends the person's open sessions (sessionVersion).
    const bump = db.prepare('UPDATE members SET sessionVersion=sessionVersion+1, updatedAt=? WHERE id=?').bind(now, member.id);
    if (data.action === 'update') {
      if (!isRole(data.role)) throw new Error('Escolha o perfil de acesso.');
      const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 120) : member.name;
      await db.batch([
        db.prepare('UPDATE members SET role=?, name=? WHERE id=?').bind(data.role, name, member.id),
        ...setLinks(member.id, await workspaceIds()),
        bump,
      ]);
      return Response.json({ ok: true, message: 'Acesso atualizado.' });
    }
    if (data.action === 'relink') {
      if (member.status === 'disabled') throw new Error('Reative a pessoa antes de gerar um link.');
      const invite = await createInvite(member.id);
      // A new link also lets an active person set a new password.
      return Response.json({ ok: true, link: inviteLink(invite.token), expiresAt: invite.expires, days: INVITE_DAYS });
    }
    if (data.action === 'disable') {
      await db.batch([
        db.prepare("UPDATE members SET status='disabled' WHERE id=?").bind(member.id),
        db.prepare('DELETE FROM member_invites WHERE memberId=? AND usedAt IS NULL').bind(member.id),
        bump,
      ]);
      return Response.json({ ok: true, message: 'Acesso suspenso. A pessoa saiu do COODY.' });
    }
    if (data.action === 'enable') {
      await db.batch([
        db.prepare('UPDATE members SET status=? WHERE id=?').bind(member.passwordHash ? 'active' : 'invited', member.id),
        bump,
      ]);
      return Response.json({ ok: true, message: member.passwordHash ? 'Acesso reativado.' : 'Reativado. Gere um novo link de convite.' });
    }
    if (data.action === 'remove') {
      await db.batch([
        db.prepare('DELETE FROM member_invites WHERE memberId=?').bind(member.id),
        db.prepare('DELETE FROM member_workspaces WHERE memberId=?').bind(member.id),
        db.prepare('DELETE FROM members WHERE id=?').bind(member.id),
      ]);
      return Response.json({ ok: true, message: 'Pessoa removida.' });
    }
    throw new Error('Ação inválida.');
  } catch (error) {
    return Response.json(
      { error: error instanceof Error && !/SQLITE/.test(error.message) ? error.message : 'Não foi possível salvar.' },
      { status: 400 },
    );
  }
}
