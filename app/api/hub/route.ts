import { env } from 'cloudflare:workers';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { database } from '@/lib/repository';
import { signSession } from '@/lib/session';
import { ensureMembers, memberByEmail, memberWorkspaces } from '@/lib/members';

/**
 * Integração com o Oxyhub (painel único dos sistemas Oxycom). Só ACRESCENTA:
 * o login, as tabelas e as telas do OxyCreate continuam iguais.
 *
 * POST (servidor do Oxyhub → aqui, com x-hub-secret):
 *   { action: "pendencias", email } → o que a pessoa tem para fazer no OxyCreate
 *   { action: "acesso", email, para? } → URL de entrada de uso único, válida por 60 s (para = caminho interno, ex.: /#Studio?id=…)
 *   { action: "eventos", email, from, to } → conteúdos com data para o OxyCalendar (somente leitura)
 *   { action: "membros", email } → quem tem acesso ao OxyCreate, papel e situação (somente leitura; só para administradores)
 *   { action: "acesso_opcoes", email } → perfis e workspaces possíveis (tela "Pessoas e acessos" do Oxyhub; só administradores)
 *   { action: "definir_acesso", email, alvo, nome?, papel, escopo? } → inclui/atualiza (ativo, entra pelo Oxyhub)
 *       ou suspende (papel null) uma pessoa; escopo = workspaces liberados (vazio = todos). Só administradores.
 * GET /api/hub?t=… → abre a sessão do OxyCreate (cookie coody_session) e vai para o início.
 *
 * Variável de ambiente: COODY_HUB_SECRET (32+ caracteres, o mesmo valor no Oxyhub).
 */
const TTL = 60;

type Config = Record<string, string | undefined>;
const cfg = () => env as unknown as Config;

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** Caminho interno de destino (ex.: /#Studio?id=…); qualquer outro valor volta ao início. */
function safePara(p: unknown) {
  return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') && !p.includes('\\') && p.length <= 300 ? p : null;
}

function sign(payload: string, secret: string) {
  return createHmac('sha256', 'coody-hub:' + secret).update(payload).digest('base64url');
}

/** Dono ou membro ativo com esse e-mail; null se não tem acesso. */
async function person(email: string) {
  const owner = (cfg().COODY_OWNER_EMAIL ?? '').trim().toLowerCase();
  if (owner && email === owner) return { kind: 'owner' as const, email: owner };
  const m = await memberByEmail(email).catch(() => null);
  if (m && m.status === 'active') return { kind: 'member' as const, email: m.email, member: m };
  return null;
}

export async function POST(request: Request) {
  const c = cfg();
  if (c.COODY_RUNTIME !== 'vercel') return new Response(null, { status: 404 });
  const secret = c.COODY_HUB_SECRET ?? '';
  if (secret.length < 32 || !sameSecret(request.headers.get('x-hub-secret') ?? '', secret)) return new Response(null, { status: 403 });
  const raw = await request.text();
  if (raw.length > 8192) return new Response(null, { status: 413 });
  let data: { action?: unknown; email?: unknown; para?: unknown; from?: unknown; to?: unknown; alvo?: unknown; nome?: unknown; papel?: unknown; escopo?: unknown };
  try {
    data = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase().slice(0, 200) : '';
  const who = email ? await person(email) : null;
  if (!who) return Response.json({ access: false }, { headers: { 'Cache-Control': 'no-store' } });

  const isAdmin = who.kind === 'owner' || (who.kind === 'member' && who.member.role === 'ADMINISTRADOR');
  if (data.action === 'acesso_opcoes') {
    if (!isAdmin) return Response.json({ access: true, error: 'Somente administradores.' }, { status: 403 });
    const ws = (await database().prepare('SELECT id,name FROM workspaces ORDER BY createdAt,id').all<{ id: string; name: string }>()).results;
    return Response.json(
      {
        access: true,
        roles: [
          { value: 'ADMINISTRADOR', label: 'Administrador' },
          { value: 'EDITOR', label: 'Editor' },
          { value: 'APROVADOR', label: 'Aprovador' },
        ],
        scopes: { label: 'Workspaces', items: ws.map((w) => ({ id: w.id, name: w.name })) },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (data.action === 'definir_acesso') {
    if (!isAdmin) return Response.json({ access: true, error: 'Somente administradores.' }, { status: 403 });
    await ensureMembers();
    const db = database();
    const alvo = typeof data.alvo === 'string' ? data.alvo.trim().toLowerCase().slice(0, 200) : '';
    const nome = typeof data.nome === 'string' ? data.nome.trim().slice(0, 120) : '';
    const papel = data.papel === null ? null : String(data.papel ?? '');
    const fail = (error: string, status = 400) => Response.json({ access: true, error }, { status });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alvo)) return fail('E-mail inválido.');
    if (alvo === (c.COODY_OWNER_EMAIL ?? '').trim().toLowerCase()) return fail('O administrador principal não pode ser alterado por aqui.');
    if (papel !== null && !['ADMINISTRADOR', 'EDITOR', 'APROVADOR'].includes(papel)) return fail('Perfil inválido.');
    const now = new Date().toISOString();
    const current = await memberByEmail(alvo);
    if (papel === null) {
      if (current)
        await db.batch([
          db.prepare("UPDATE members SET status='disabled', sessionVersion=sessionVersion+1, updatedAt=? WHERE id=?").bind(now, current.id),
          db.prepare('DELETE FROM member_invites WHERE memberId=? AND usedAt IS NULL').bind(current.id),
        ]);
      return Response.json({ access: true, ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const known = (await db.prepare('SELECT id FROM workspaces').all<{ id: string }>()).results.map((w) => w.id);
    const asked = Array.isArray(data.escopo) ? [...new Set(data.escopo.filter((x): x is string => typeof x === 'string'))] : [];
    if (asked.some((id) => !known.includes(id))) return fail('Workspace inválido.');
    const list = asked.length ? asked : known;
    const id = current?.id ?? crypto.randomUUID();
    const links = [
      db.prepare('DELETE FROM member_workspaces WHERE memberId=?').bind(id),
      ...list.map((w) => db.prepare('INSERT INTO member_workspaces (memberId,workspaceId) VALUES (?,?)').bind(id, w)),
    ];
    // Entra pelo Oxyhub: fica ativo sem senha própria (o link de uso único do Hub abre a sessão).
    await db.batch([
      current
        ? db
            .prepare("UPDATE members SET role=?, name=?, status='active', sessionVersion=sessionVersion+1, updatedAt=? WHERE id=?")
            .bind(papel, nome || current.name, now, id)
        : db
            .prepare("INSERT INTO members (id,email,name,role,status,createdAt,updatedAt) VALUES (?,?,?,?,'active',?,?)")
            .bind(id, alvo, nome || alvo.split('@')[0], papel, now, now),
      ...links,
    ]);
    return Response.json({ access: true, ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (data.action === 'membros') {
    if (!(who.kind === 'owner' || (who.kind === 'member' && who.member.role === 'ADMINISTRADOR'))) return Response.json({ access: true, error: 'Somente administradores.' }, { status: 403 });
    await ensureMembers();
    const rows = (
      await database()
        .prepare(
          "SELECT m.email, m.name, m.role, m.status, (SELECT group_concat(w.workspaceId) FROM member_workspaces w WHERE w.memberId=m.id) AS ws FROM members m WHERE m.status <> 'disabled' ORDER BY m.name",
        )
        .all<{ email: string; name: string; role: string; status: string; ws: string | null }>()
    ).results;
    const ROLE: Record<string, string> = { ADMINISTRADOR: 'Administrador', EDITOR: 'Editor', APROVADOR: 'Aprovador' };
    const owner = (c.COODY_OWNER_EMAIL ?? '').trim().toLowerCase();
    return Response.json(
      {
        access: true,
        members: [
          ...(owner ? [{ email: owner, name: null, role: 'Dono da conta', papel: 'dono' }] : []),
          ...rows.map((m) => ({
            email: m.email.toLowerCase(),
            name: m.name,
            role: (ROLE[m.role] ?? m.role) + (m.status === 'invited' ? ' (convite pendente)' : ''),
            papel: m.role,
            escopo: m.ws ? m.ws.split(',') : [],
          })),
        ],
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (data.action === 'acesso') {
    const payload = Buffer.from(
      JSON.stringify({ email: who.email, exp: Math.floor(Date.now() / 1000) + TTL, n: randomBytes(12).toString('base64url'), p: safePara(data.para) }),
    ).toString('base64url');
    const url = `${new URL(request.url).origin}/api/hub?t=${payload}.${sign(payload, secret)}`;
    return Response.json({ access: true, url }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (data.action === 'eventos') {
    const day = /^\d{4}-\d{2}-\d{2}$/;
    const from = String(data.from ?? ''), to = String(data.to ?? '');
    if (!day.test(from) || !day.test(to) || to < from) return new Response(null, { status: 400 });
    let filter = '';
    let binds: string[] = [];
    if (who.kind === 'member') {
      const ws = await memberWorkspaces(who.member.id);
      if (!ws.length) return Response.json({ access: true, events: [] }, { headers: { 'Cache-Control': 'no-store' } });
      filter = ` AND b.workspaceId IN (${ws.map(() => '?').join(',')})`;
      binds = ws;
    }
    const { results } = await database()
      .prepare(
        `SELECT c.id, c.title, c.brief, c.date, c.format, c.status, c.createdAt, c.brandId, b.name AS brandName, b.workspaceId
         FROM content_items c JOIN brands b ON b.id = c.brandId
         WHERE c.deletedAt IS NULL AND b.deletedAt IS NULL AND substr(c.date, 1, 10) BETWEEN ? AND ?${filter}
         ORDER BY c.date LIMIT 2000`,
      )
      .bind(from, to, ...binds)
      .all<{ id: string; title: string; brief: string; date: string; format: string; status: string; createdAt: string; brandId: string; brandName: string; workspaceId: string }>();
    const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    const TONE: Record<string, string> = {
      IDEIA: 'draft', PLANEJADO: 'draft', 'EM CRIAÇÃO': 'primary', 'REVISÃO': 'primary', 'APROVAÇÃO': 'awaiting',
      AJUSTE: 'changes', 'ALTERAÇÃO': 'changes', APROVADO: 'approved', PUBLICADO: 'muted',
    };
    const done = (s: string) => s === 'APROVADO' || s === 'PUBLICADO';
    const events = (results ?? []).map((c) => {
      const date = c.date.slice(0, 10);
      const label = c.status.charAt(0) + c.status.slice(1).toLowerCase();
      return {
        source_record_id: c.id,
        organization_id: c.workspaceId,
        kind: 'conteudo',
        kind_label: c.format ? `Conteúdo · ${c.format}` : 'Conteúdo',
        title: c.title || c.format || 'Conteúdo',
        description: c.brief || null,
        start_at: date,
        end_at: null,
        all_day: true,
        client_id: c.brandId,
        client_name: c.brandName,
        responsible_user_id: null,
        responsible_name: null,
        status: label,
        status_tone: TONE[c.status] ?? 'primary',
        overdue: date < today && !done(c.status),
        derived: false,
        source_path: `/#Studio?id=${encodeURIComponent(c.id)}`,
        updated_at: c.createdAt,
      };
    });
    return Response.json({ access: true, events }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (data.action === 'pendencias') {
    // Workspaces que a pessoa enxerga: todos para o dono, os liberados para membros
    let filter = '';
    let binds: string[] = [];
    if (who.kind === 'member') {
      const ws = await memberWorkspaces(who.member.id);
      if (!ws.length) return Response.json({ access: true, items: [] });
      filter = ` AND b.workspaceId IN (${ws.map(() => '?').join(',')})`;
      binds = ws;
    }
    const today = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
    const row = await database()
      .prepare(
        `SELECT
           SUM(CASE WHEN c.status = 'REVISÃO' THEN 1 ELSE 0 END) AS revisao,
           SUM(CASE WHEN c.status = 'APROVAÇÃO' THEN 1 ELSE 0 END) AS aprovacao,
           SUM(CASE WHEN c.status IN ('AJUSTE','ALTERAÇÃO') THEN 1 ELSE 0 END) AS ajustes,
           SUM(CASE WHEN c.date < ? AND c.status NOT IN ('APROVADO','PUBLICADO') THEN 1 ELSE 0 END) AS atrasados
         FROM content_items c JOIN brands b ON b.id = c.brandId
         WHERE c.deletedAt IS NULL AND b.deletedAt IS NULL${filter}`,
      )
      .bind(today, ...binds)
      .first<{ revisao: number | null; aprovacao: number | null; ajustes: number | null; atrasados: number | null }>();
    const n = (v: number | null | undefined) => Number(v ?? 0);
    return Response.json(
      {
        access: true,
        items: [
          { key: 'ajustes', label: 'conteúdos em ajuste', count: n(row?.ajustes), tone: 'changes' },
          { key: 'revisao', label: 'conteúdos em revisão', count: n(row?.revisao), tone: 'primary' },
          { key: 'aprovacao', label: 'aguardando aprovação', count: n(row?.aprovacao), tone: 'awaiting' },
          { key: 'atrasados', label: 'com a data já passada', count: n(row?.atrasados), tone: 'changes' },
        ],
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
  return new Response(null, { status: 400 });
}

export async function GET(request: Request) {
  const c = cfg();
  const origin = new URL(request.url).origin;
  const fail = () => Response.redirect(origin + '/', 302);
  if (c.COODY_RUNTIME !== 'vercel' || !c.COODY_SESSION_SECRET) return new Response(null, { status: 404 });
  const secret = c.COODY_HUB_SECRET ?? '';
  const t = new URL(request.url).searchParams.get('t') ?? '';
  const [payload, signature, extra] = t.split('.');
  if (secret.length < 32 || extra !== undefined || !payload || !signature || t.length > 1024) return fail();
  if (!sameSecret(signature, sign(payload, secret))) return fail();
  let data: { email?: string; exp?: number; n?: string; p?: string | null };
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return fail();
  }
  const now = Math.floor(Date.now() / 1000);
  if (!data.email || !data.n || !Number.isFinite(data.exp) || data.exp! <= now) return fail();

  // Uso único: o passe é gravado e não vale de novo
  const used = await database()
    .prepare('INSERT INTO login_attempts (id,attempts,expires) VALUES (?,1,?) ON CONFLICT(id) DO NOTHING RETURNING id')
    .bind('hub:' + data.n, now + TTL)
    .first<{ id: string }>();
  if (!used) return fail();

  const who = await person(data.email.toLowerCase());
  if (!who) return fail();
  const token =
    who.kind === 'owner'
      ? signSession(who.email, c.COODY_SESSION_SECRET)
      : signSession(who.email, c.COODY_SESSION_SECRET, Date.now(), { uid: who.member.id, ver: who.member.sessionVersion });
  return new Response(null, {
    status: 302,
    headers: {
      Location: origin + (safePara(data.p) ?? '/'),
      'Cache-Control': 'no-store',
      'Set-Cookie': `coody_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`,
    },
  });
}
