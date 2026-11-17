import { authorize, registerUser } from '@/lib/auth';
import { database, readState } from '@/lib/repository';
import { can, deniedMessage } from '@/lib/permissions';
import { isInactive } from '@/lib/brand-lifecycle';
import {
  brandLinks,
  contentLinks,
  createFormat,
  ensurePlanningTables,
  planningConfigured,
  ponte,
  syncFromPlanning,
} from '@/lib/oxyplanning';

/**
 * Pautas do OxyPlanning dentro do OxyCreate (/api/oxyplanning).
 * GET  → clientes do OxyPlanning, vínculos marca↔cliente e pautas a partir de hoje (já sincroniza o status)
 * POST { action: "link", brandId, clientId, clientName } / { action: "unlink", brandId }   (administradores)
 * POST { action: "produce", postId }  → cria a pauta "Planejado" no OxyCreate, ligada à publicação
 * POST { action: "release", contentId } → desfaz a ligação de uma pauta ainda não enviada
 */

type Post = {
  id: string;
  client_id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  format: string;
  format_label: string | null;
  status: string;
  current_version_id: string | null;
  is_extraordinary: boolean;
  /** Arquivos na versão atual (enviada pela ponte do Oxyhub; ausente em versões antigas) */
  media_count?: number;
  campaign: { name: string } | null;
  version: { title: string; theme: string | null; objective: string | null; art_text: string | null; caption?: string | null; submitted_at: string | null } | null;
};

/** Pode ser produzida no OxyCreate: rascunho, ou enviada ao cliente só com texto (sem arquivo) e ainda não aprovada. */
const needsArt = (p: Post) => p.status === 'draft' || ((p.status === 'awaiting' || p.status === 'changes_requested') && p.media_count === 0);

/** Primeira versão do conteúdo (o Studio precisa dela): título, texto da arte e legenda que vieram do OxyPlanning. */
const firstVersion = (db: D1Database, contentId: string, v: { title?: string; art_text?: string | null; caption?: string | null } | null, now: string) =>
  db
    .prepare("INSERT INTO content_versions (id, contentId, number, headline, copy, caption, hashtags, feedUrl, storyUrl, change, createdAt, locked) VALUES (?,?,1,?,?,?,'[]','','',?,?,0)")
    .bind(crypto.randomUUID(), contentId, v?.title || 'Pauta do OxyPlanning', v?.art_text || '', v?.caption || '', 'Briefing do OxyPlanning', now);

/** Conteúdos criados a partir de pautas antes desta correção ficaram sem versão: cria a primeira. */
async function repairMissingVersions(db: D1Database) {
  const orphans = await db
    .prepare('SELECT c.id, c.title FROM content_items c JOIN planning_content_links l ON l.contentId = c.id WHERE NOT EXISTS (SELECT 1 FROM content_versions v WHERE v.contentId = c.id)')
    .all<{ id: string; title: string }>();
  const rows = orphans.results ?? [];
  if (rows.length) await db.batch(rows.map((r) => firstVersion(db, r.id, { title: r.title }, new Date().toISOString())));
}

const today = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const str = (v: unknown, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function GET(request: Request) {
  const user = await authorize(request);
  const q = new URL(request.url).searchParams;
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const from = DAY.test(q.get('from') || '') ? q.get('from')! : today();
  const to = DAY.test(q.get('to') || '') ? q.get('to')! : '';
  if (user instanceof Response) return user;
  if (!planningConfigured())
    return Response.json({ state: 'aguardando_integracao', message: 'Integração com o OxyPlanning ainda não configurada.' });
  try {
    await ensurePlanningTables();
    await repairMissingVersions(database()).catch(() => undefined);
    const state = await readState(request);
    const visible = new Set(state.brands.map((b) => b.id));
    const links = (await brandLinks()).filter((l) => visible.has(l.brandId));
    const syncError = await syncFromPlanning()
      .then(() => '')
      .catch((e: Error) => e.message);
    const [{ clients }, { posts }, cLinks] = await Promise.all([
      ponte<{ clients: { id: string; name: string; slug: string }[] }>({ action: 'clientes' }),
      links.length
        ? ponte<{ posts: Post[] }>({ action: 'pautas', client_ids: [...new Set(links.map((l) => l.clientId))], from, to })
        : Promise.resolve({ posts: [] as Post[] }),
      contentLinks(),
    ]);
    const byPost = new Map(cLinks.map((l) => [l.postId, l]));
    const brandOf = new Map(links.map((l) => [l.clientId, l.brandId]));
    return Response.json(
      {
        state: 'operacional',
        syncError,
        clients,
        links,
        pautas: posts.map((p) => ({
          postId: p.id,
          brandId: brandOf.get(p.client_id) || '',
          date: p.scheduled_date,
          time: p.scheduled_time,
          format: p.format,
          formatLabel: p.format_label,
          createFormat: createFormat(p.format),
          planningStatus: p.status,
          title: p.version?.title || '',
          theme: p.version?.theme || '',
          objective: p.version?.objective || '',
          campaign: p.campaign?.name || '',
          extra: p.is_extraordinary,
          hasArt: !needsArt(p),
          contentId: byPost.get(p.id)?.contentId || '',
        })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    console.error('planning', e);
    return Response.json({ state: 'erro', message: e instanceof Error ? e.message : 'OxyPlanning indisponível.' }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const user = await authorize(request);
  if (user instanceof Response) return user;
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  try {
    await registerUser(user);
    await ensurePlanningTables();
    const db = database();
    const body = (await request.json()) as Record<string, unknown>;
    const state = await readState(request);
    const now = new Date().toISOString();

    if (body.action === 'link' || body.action === 'unlink') {
      if (!can(user.role, 'manage')) throw new Error(deniedMessage('manage'));
      const brand = state.brands.find((b) => b.id === body.brandId);
      if (!brand) throw new Error('Marca não encontrada.');
      if (body.action === 'unlink') {
        await db.prepare('DELETE FROM planning_brand_links WHERE brandId=?').bind(brand.id).run();
        return Response.json({ ok: true });
      }
      const clientId = str(body.clientId, 60);
      const { clients } = await ponte<{ clients: { id: string; name: string }[] }>({ action: 'clientes' });
      const client = clients.find((c) => c.id === clientId);
      if (!client) throw new Error('Cliente não encontrado no OxyPlanning.');
      const taken = await db.prepare('SELECT brandId FROM planning_brand_links WHERE clientId=? AND brandId<>?').bind(client.id, brand.id).first();
      if (taken) throw new Error(`O cliente ${client.name} já está ligado a outra marca.`);
      await db
        .prepare('INSERT INTO planning_brand_links (brandId, clientId, clientName, linkedAt, linkedBy) VALUES (?,?,?,?,?) ON CONFLICT(brandId) DO UPDATE SET clientId=excluded.clientId, clientName=excluded.clientName, linkedAt=excluded.linkedAt, linkedBy=excluded.linkedBy')
        .bind(brand.id, client.id, client.name, now, user.email)
        .run();
      return Response.json({ ok: true });
    }

    if (body.action === 'produce') {
      if (!can(user.role, 'edit')) throw new Error(deniedMessage('edit'));
      const postId = str(body.postId, 60);
      const exists = await db.prepare('SELECT contentId FROM planning_content_links WHERE postId=?').bind(postId).first<{ contentId: string }>();
      if (exists) {
        await repairMissingVersions(db);
        return Response.json({ ok: true, contentId: exists.contentId });
      }
      const links = await brandLinks();
      const { posts } = await ponte<{ posts: Post[] }>({ action: 'pautas', client_ids: [...new Set(links.map((l) => l.clientId))], from: '2000-01-01' });
      const post = posts.find((p) => p.id === postId);
      if (!post) throw new Error('Publicação não encontrada no OxyPlanning.');
      const brandId = links.find((l) => l.clientId === post.client_id)?.brandId;
      const brand = state.brands.find((b) => b.id === brandId);
      if (!brand) throw new Error('A marca ligada a este cliente não está neste workspace.');
      if (isInactive(brand)) throw new Error(`A marca ${brand.name} está inativa. Reative-a em Marcas para continuar.`);
      if (!needsArt(post)) throw new Error('Esta publicação já tem arte enviada no OxyPlanning.');
      const contentId = crypto.randomUUID();
      const brief = [post.version?.art_text, post.campaign?.name ? `Campanha: ${post.campaign.name}` : '', post.format_label ? `Formato no OxyPlanning: ${post.format_label}` : '']
        .filter(Boolean)
        .join('\n');
      await db.batch([
        db
          .prepare("INSERT INTO content_items (id, revision, brandId, title, brief, objective, pillar, date, format, status, createdAt, attachments) VALUES (?,0,?,?,?,?,?,?,?,'PLANEJADO',?,'[]')")
          .bind(contentId, brand.id, post.version?.title || 'Pauta do OxyPlanning', brief, post.version?.objective || '', post.version?.theme || '', post.scheduled_date, createFormat(post.format), now),
        firstVersion(db, contentId, post.version, now),
        db
          .prepare('INSERT INTO planning_content_links (contentId, postId, clientId, planningStatus, createdAt) VALUES (?,?,?,?,?)')
          .bind(contentId, post.id, post.client_id, post.status, now),
      ]);
      return Response.json({ ok: true, contentId });
    }

    if (body.action === 'release') {
      if (!can(user.role, 'edit')) throw new Error(deniedMessage('edit'));
      const contentId = str(body.contentId, 60);
      const link = await db.prepare('SELECT sentVersionId FROM planning_content_links WHERE contentId=?').bind(contentId).first<{ sentVersionId: string | null }>();
      if (!link) return Response.json({ ok: true });
      if (link.sentVersionId) throw new Error('Esta pauta já foi enviada ao cliente pelo OxyPlanning.');
      await db.prepare('DELETE FROM planning_content_links WHERE contentId=?').bind(contentId).run();
      return Response.json({ ok: true });
    }

    return Response.json({ error: 'Ação desconhecida.' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Não foi possível concluir.' }, { status: 400 });
  }
}
