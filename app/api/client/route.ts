import { database, ensureBrandLifecycle } from '@/lib/repository';
import { shareByToken } from '@/lib/share';
import { approvedArtRecord, assertTransition, planApprovalOf } from '@/lib/domain';
import { statusLabels, type Asset, type Status } from '@/lib/types';

/**
 * Public, by client link token: the brand's board and month plan (GET) and
 * the client's decision on a piece waiting for approval (POST). Files are
 * served through /api/assets/<id>?share=<token>.
 */
const parse = <T,>(v: unknown, fallback: T): T => {
  try {
    return typeof v === 'string' ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const fileUrl = (url: string, token: string) =>
  /^\/api\/assets\/[A-Za-z0-9-]+$/.test(url || '') ? url + '?share=' + token : '';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const token = params.get('token') || '';
  const share = await shareByToken(token).catch(() => null);
  if (!share)
    return Response.json({ error: 'Este link não está mais ativo. Peça um novo à agência.' }, { status: 404 });
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('month') || '')
    ? params.get('month')!
    : new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
  try {
    await ensureBrandLifecycle();
    const db = database();
    const brand = await db
      .prepare('SELECT id,name,segment,avatarUrl,colors FROM brands WHERE id=?')
      .bind(share.brandId)
      .first<{ id: string; name: string; segment: string; avatarUrl: string; colors: string }>();
    if (!brand) throw new Error('Marca não encontrada.');
    // The month's pieces plus anything still waiting for the client.
    const contents = (
      await db
        .prepare(
          "SELECT id,title,brief,pillar,date,format,status,revision FROM content_items WHERE brandId=? AND deletedAt IS NULL AND (date LIKE ? OR status IN ('APROVAÇÃO','AJUSTE','ALTERAÇÃO')) ORDER BY date",
        )
        .bind(brand.id, month + '%')
        .all<{ id: string; title: string; brief: string; pillar: string; date: string; format: string; status: Status; revision: number }>()
    ).results;
    const ids = contents.map((c) => c.id);
    const marks = ids.map(() => '?').join(',') || "''";
    const [versions, comments, plan, stories, sent] = await db.batch([
      db.prepare(`SELECT * FROM content_versions WHERE contentId IN (${marks})`).bind(...ids),
      // Only the client's own messages: the team's conversation stays internal.
      db
        .prepare(
          `SELECT contentId,text,createdAt,user FROM comments WHERE contentId IN (${marks}) AND user LIKE 'Cliente ·%' ORDER BY createdAt`,
        )
        .bind(...ids),
      db.prepare('SELECT month,monthlyGoal,campaign,approval,approvalNote,approvedAt,approvedBy FROM monthly_plans WHERE brandId=? AND month=?').bind(brand.id, month),
      db.prepare("SELECT id FROM brand_assets WHERE brandId=? AND id LIKE 'story-%'").bind(brand.id),
      // Versions that were sent to the client (or decided on).
      db.prepare(`SELECT DISTINCT versionId FROM approvals WHERE contentId IN (${marks})`).bind(...ids),
    ]);
    const sentIds = new Set((sent.results as { versionId: string }[]).map((r) => r.versionId));
    const storyIds = new Set((stories.results as { id: string }[]).map((s) => s.id));
    // What the client sees: the piece as sent for approval. While the team is
    // still creating or fixing it, the last version the client already saw
    // (never a draft); planned pieces show no art yet.
    const latest = new Map<string, Record<string, unknown>>();
    const latestSent = new Map<string, Record<string, unknown>>();
    for (const v of versions.results as Record<string, unknown>[]) {
      const key = v.contentId as string;
      const prev = latest.get(key);
      if (!prev || (v.number as number) > (prev.number as number)) latest.set(key, v);
      const prevSent = latestSent.get(key);
      if (sentIds.has(v.id as string) && (!prevSent || (v.number as number) > (prevSent.number as number)))
        latestSent.set(key, v);
    }
    const items = contents.map((c) => {
      const v = ['APROVAÇÃO', 'APROVADO', 'PUBLICADO'].includes(c.status)
        ? latest.get(c.id)
        : latestSent.get(c.id);
      const feed = (v?.feedUrl as string) || '';
      const sourceId = /^\/api\/assets\/([A-Za-z0-9-]+)$/.exec(feed)?.[1];
      const story = sourceId && storyIds.has('story-' + sourceId) ? '/api/assets/story-' + sourceId : '';
      return {
        ...c,
        statusLabel: statusLabels[c.status] || c.status,
        headline: (v?.headline as string) || '',
        copy: (v?.copy as string) || '',
        caption: (v?.caption as string) || '',
        hashtags: parse<string[]>(v?.hashtags, []),
        feedUrl: fileUrl(feed, token),
        storyUrl: fileUrl(story, token),
        media: parse<{ url: string; mime: string; name: string }[]>(v?.media, []).map((m) => ({
          ...m,
          url: fileUrl(m.url, token),
        })),
        comments: (comments.results as { contentId: string; text: string; createdAt: string; user: string }[])
          .filter((m) => m.contentId === c.id)
          .map(({ text, createdAt, user }) => ({ text, createdAt, user })),
      };
    });
    return Response.json(
      {
        brand: { name: brand.name, segment: brand.segment, colors: brand.colors },
        month,
        plan: (() => {
          const p = plan.results[0] as Record<string, unknown> | undefined;
          // Older plans have no approval state and count as approved.
          return p ? { ...p, approval: planApprovalOf(p as { approval?: string }) } : null;
        })(),
        items,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json({ error: 'Não foi possível abrir o quadro agora.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  try {
    const raw = await request.text();
    if (raw.length > 8000) throw new Error('Mensagem muito grande.');
    const data = JSON.parse(raw) as { token?: string; id?: string; status?: string; comment?: string; name?: string; month?: string };
    const share = await shareByToken(String(data.token || ''));
    if (!share) throw new Error('Este link não está mais ativo.');
    const db = database();
    if (data.month !== undefined) return await planDecision(db, share.brandId, data);
    const item = await db
      .prepare('SELECT id,title,date,status,brandId FROM content_items WHERE id=? AND brandId=? AND deletedAt IS NULL')
      .bind(String(data.id || ''), share.brandId)
      .first<{ id: string; title: string; date: string; status: Status; brandId: string }>();
    if (!item) throw new Error('Peça não encontrada.');
    const target = data.status as Status;
    if (item.status !== 'APROVAÇÃO' || !['APROVADO', 'AJUSTE', 'ALTERAÇÃO'].includes(target))
      throw new Error('Esta peça não está aguardando aprovação.');
    assertTransition(item.status, target);
    const comment = typeof data.comment === 'string' ? data.comment.trim().slice(0, 2000) : '';
    if (target !== 'APROVADO' && !comment)
      throw new Error(target === 'AJUSTE' ? 'Descreva o ajuste.' : 'Descreva a alteração.');
    const name = (typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Cliente').slice(0, 80);
    const version = await db
      .prepare('SELECT id,number,feedUrl FROM content_versions WHERE contentId=? ORDER BY number DESC LIMIT 1')
      .bind(item.id)
      .first<{ id: string; number: number; feedUrl: string }>();
    if (!version) throw new Error('Peça sem versão.');
    const now = new Date().toISOString();
    const statements = [
      db
        .prepare("UPDATE content_items SET status=?, revision=COALESCE(revision,0)+1 WHERE id=? AND status='APROVAÇÃO'")
        .bind(target, item.id),
      db
        .prepare('INSERT INTO approvals (id,contentId,versionId,decision,createdAt,userId) VALUES (?,?,?,?,?,NULL)')
        .bind(crypto.randomUUID(), item.id, version.id, target, now),
    ];
    if (target === 'APROVADO') {
      statements.push(db.prepare('UPDATE content_versions SET locked=1 WHERE id=?').bind(version.id));
      // As when the team approves: the approved art joins the brand's
      // repertoire (Biblioteca › Artes aprovadas) for future creations.
      if (version.feedUrl) {
        const assets = (
          await db
            .prepare('SELECT * FROM brand_assets WHERE brandId=? AND url=?')
            .bind(item.brandId, version.feedUrl)
            .all<Asset>()
        ).results;
        const approvedArt = approvedArtRecord(assets, {
          brandId: item.brandId,
          url: version.feedUrl,
          title: item.title,
          versionNumber: version.number,
          id: crypto.randomUUID(),
          now,
        });
        if (approvedArt) {
          const keys = Object.keys(approvedArt) as (keyof Asset)[];
          statements.push(
            db
              .prepare(`INSERT INTO brand_assets (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`)
              .bind(...keys.map((k) => approvedArt[k] as string | number)),
          );
        }
      }
    }
    if (comment)
      statements.push(
        db
          .prepare('INSERT INTO comments (id,contentId,text,createdAt,user) VALUES (?,?,?,?,?)')
          .bind(crypto.randomUUID(), item.id, comment, now, 'Cliente · ' + name),
      );
    const results = await db.batch(statements);
    if (!results[0].meta.changes) throw new Error('Esta peça já foi decidida. Atualize a página.');
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error && !/SQLITE/.test(e.message) ? e.message : 'Não foi possível registrar.' },
      { status: 400 },
    );
  }
}

/** The client approves the month plan (its pieces then enter the production
 *  board with the dates confirmed) or asks for changes. */
async function planDecision(
  db: ReturnType<typeof database>,
  brandId: string,
  data: { month?: string; status?: string; comment?: string; name?: string },
) {
  const month = String(data.month);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Mês inválido.');
  if (data.status !== 'aprovado' && data.status !== 'ajustes') throw new Error('Decisão inválida.');
  const comment = typeof data.comment === 'string' ? data.comment.trim().slice(0, 2000) : '';
  if (data.status === 'ajustes' && !comment) throw new Error('Conte o que precisa mudar no planejamento.');
  const name = (typeof data.name === 'string' && data.name.trim() ? data.name.trim() : 'Cliente').slice(0, 80);
  const now = new Date().toISOString();
  const result =
    data.status === 'aprovado'
      ? await db
          .prepare(
            "UPDATE monthly_plans SET approval='aprovado',approvedAt=?,approvedBy=? WHERE brandId=? AND month=? AND approval IN ('enviado','ajustes')",
          )
          .bind(now, 'Cliente · ' + name, brandId, month)
          .run()
      : await db
          .prepare(
            "UPDATE monthly_plans SET approval='ajustes',approvalNote=? WHERE brandId=? AND month=? AND approval='enviado'",
          )
          .bind(`${comment}\n— Cliente · ${name}`, brandId, month)
          .run();
  if (!result.meta.changes) throw new Error('Este planejamento não está aguardando sua aprovação. Atualize a página.');
  return Response.json({ ok: true });
}
