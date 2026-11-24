import { env } from 'cloudflare:workers';
import { bucket, database } from './repository';

/**
 * Integração OxyPlanning ↔ OxyStudio, pela ponte do Oxyhub (/api/ponte/planning).
 * O OxyPlanning não muda: daqui só lemos as publicações dele e, quando uma peça passa
 * na revisão interna, enviamos a arte como nova versão — pela mesma função que a equipe usa lá.
 *
 * Tabelas próprias (criadas sob demanda, não alteram as existentes):
 *   planning_brand_links   marca do OxyStudio ↔ cliente do OxyPlanning
 *   planning_content_links pauta do OxyStudio ↔ publicação do OxyPlanning, com o estado do envio
 *
 * Variáveis: COODY_HUB_SECRET (o mesmo do Oxyhub) e NEXT_PUBLIC_HUB_URL (padrão hub.oxyhub.com.br).
 */

type Config = Record<string, string | undefined>;
const cfg = () => env as unknown as Config;
const hubUrl = () =>
  (cfg().NEXT_PUBLIC_HUB_URL || process.env.NEXT_PUBLIC_HUB_URL || 'https://hub.oxyhub.com.br').replace(/\/+$/, '');

export function planningConfigured() {
  return (cfg().COODY_HUB_SECRET || '').length >= 32;
}

export async function ponte<T>(body: Record<string, unknown>): Promise<T> {
  const secret = cfg().COODY_HUB_SECRET || '';
  if (secret.length < 32) throw new Error('Integração com o OxyPlanning não configurada (COODY_HUB_SECRET).');
  const res = await fetch(hubUrl() + '/api/ponte/planning', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-secret': secret },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || `OxyPlanning indisponível (${res.status}).`);
  return data;
}

let ready = false;
export async function ensurePlanningTables() {
  if (ready) return;
  const db = database();
  await db.batch([
    db.prepare(
      'CREATE TABLE IF NOT EXISTS planning_brand_links (brandId TEXT PRIMARY KEY NOT NULL, clientId TEXT NOT NULL, clientName TEXT NOT NULL, linkedAt TEXT NOT NULL, linkedBy TEXT NOT NULL)',
    ),
    db.prepare(
      'CREATE TABLE IF NOT EXISTS planning_content_links (contentId TEXT PRIMARY KEY NOT NULL, postId TEXT NOT NULL UNIQUE, clientId TEXT NOT NULL, sentVersionId TEXT, sentContentVersionId TEXT, sentAt TEXT, sentBy TEXT, planningStatus TEXT, lastCommentAt TEXT, syncedAt TEXT, createdAt TEXT NOT NULL)',
    ),
  ]);
  // Versão do OxyPlanning que existia quando a pauta entrou em produção (para reconhecer arte enviada direto por lá)
  await db.prepare('ALTER TABLE planning_content_links ADD COLUMN baseVersionId TEXT').run().catch(() => undefined);
  ready = true;
}

export type BrandLink = { brandId: string; clientId: string; clientName: string };
export type ContentLink = {
  contentId: string;
  postId: string;
  clientId: string;
  sentVersionId: string | null;
  sentContentVersionId: string | null;
  sentAt: string | null;
  sentBy: string | null;
  planningStatus: string | null;
  lastCommentAt: string | null;
  syncedAt: string | null;
  baseVersionId?: string | null;
};

export async function brandLinks() {
  await ensurePlanningTables();
  return (await database().prepare('SELECT brandId, clientId, clientName FROM planning_brand_links').all<BrandLink>()).results;
}
export async function contentLinks() {
  await ensurePlanningTables();
  return (await database().prepare('SELECT * FROM planning_content_links').all<ContentLink>()).results;
}
export async function contentLink(contentId: string) {
  await ensurePlanningTables();
  return database().prepare('SELECT * FROM planning_content_links WHERE contentId=?').bind(contentId).first<ContentLink>();
}

/** Formato do OxyPlanning → formato do OxyStudio. */
export function createFormat(format: string) {
  return (
    { static: 'Feed + Story', carousel: 'Carrossel', video: 'Vídeo', reel: 'Vídeo', story: 'Story' } as Record<string, string>
  )[format] || 'Arquivo';
}

type VersionRow = {
  id: string;
  number: number;
  headline: string;
  copy: string;
  caption: string;
  hashtags: string;
  feedUrl: string;
  storyUrl: string;
  media?: string | null;
};

const MIME_OK = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'application/pdf'];

/** Arquivos da versão (feed, story, slides, vídeo), servidos pelo próprio OxyStudio. */
function filesOf(item: { format: string }, v: VersionRow) {
  let media: { url: string; mime?: string; name?: string }[] = [];
  try {
    media = v.media ? JSON.parse(v.media) : [];
  } catch {
    media = [];
  }
  if (media.length) return media.map((m) => m.url);
  const urls: string[] = [];
  if (item.format !== 'Story' && v.feedUrl) urls.push(v.feedUrl);
  if (item.format.includes('Story') && v.storyUrl && v.storyUrl !== v.feedUrl) urls.push(v.storyUrl);
  if (item.format === 'Story' && !urls.length && v.feedUrl) urls.push(v.feedUrl);
  return urls;
}

/** Sobe os arquivos da biblioteca do OxyStudio para a pasta do cliente no OxyPlanning. */
async function uploadToPlanning(clientId: string, urls: string[]) {
  const db = database();
  const files: { body: ArrayBuffer; mime: string; name: string; size: number }[] = [];
  for (const url of urls) {
    const m = /^\/api\/assets\/([^?#/]+)/.exec(url);
    if (!m) throw new Error('Um dos arquivos não está na biblioteca do OxyStudio. Envie-o pela biblioteca e tente de novo.');
    const asset = await db
      .prepare('SELECT id, brandId, mime, name FROM brand_assets WHERE id=?')
      .bind(m[1])
      .first<{ id: string; brandId: string; mime: string; name: string }>();
    if (!asset) throw new Error('Arquivo da peça não encontrado.');
    if (!MIME_OK.includes(asset.mime))
      throw new Error(`O OxyPlanning não aceita arquivos ${asset.mime}. Use JPG, PNG, WEBP, MP4, MOV ou PDF.`);
    const object = await bucket().get(`brands/${asset.brandId}/${asset.id}`);
    if (!object) throw new Error('Arquivo da peça não encontrado no armazenamento.');
    const body = await object.arrayBuffer();
    files.push({ body, mime: asset.mime, name: asset.name || asset.id, size: body.byteLength });
  }

  const { uploads } = await ponte<{ uploads: { storage_path: string; signed_url: string }[] }>({
    action: 'upload',
    client_id: clientId,
    files: files.map((f) => ({ name: f.name, mime: f.mime })),
  });
  await Promise.all(
    uploads.map(async (u, i) => {
      const r = await fetch(u.signed_url, {
        method: 'PUT',
        headers: { 'content-type': files[i].mime, 'x-upsert': 'false' },
        body: files[i].body,
        signal: AbortSignal.timeout(60_000),
      });
      if (!r.ok) throw new Error(`Falha ao enviar o arquivo ${files[i].name} ao OxyPlanning (${r.status}).`);
    }),
  );

  return { uploads, files };
}

/**
 * Envia a peça aprovada internamente para o cliente no OxyPlanning: sobe os arquivos para a pasta
 * do cliente e cria a nova versão em nome de quem aprovou. Lança erro (e o status não muda) se falhar.
 */
export async function sendToPlanning(opts: {
  link: ContentLink;
  item: { id: string; brandId: string; title: string; pillar: string; objective: string; format: string };
  version: VersionRow;
  email: string;
}) {
  const { link, item, version, email } = opts;
  const db = database();
  const urls = filesOf(item, version);
  if (!urls.length) throw new Error('Anexe a arte antes de enviar ao cliente.');

  const { uploads, files } = await uploadToPlanning(link.clientId, urls);

  let hashtags: string[] = [];
  try {
    hashtags = JSON.parse(version.hashtags || '[]');
  } catch {
    hashtags = (version.hashtags || '').split(/[\s,]+/).filter(Boolean);
  }
  const { version_id } = await ponte<{ version_id: string }>({
    action: 'enviar',
    post_id: link.postId,
    email,
    content: {
      title: item.title,
      theme: item.pillar,
      objective: item.objective,
      art_text: [version.headline, version.copy].filter(Boolean).join('\n\n'),
      caption: version.caption,
      hashtags,
    },
    media: uploads.map((u, i) => ({ storage_path: u.storage_path, file_name: files[i].name, mime_type: files[i].mime, size_bytes: files[i].size })),
    change_note: `Enviada pelo OxyStudio (versão ${version.number}) após revisão interna`,
  });
  const now = new Date().toISOString();
  await db
    .prepare(
      "UPDATE planning_content_links SET sentVersionId=?, sentContentVersionId=?, sentAt=?, sentBy=?, planningStatus='awaiting', lastCommentAt=?, syncedAt=? WHERE contentId=?",
    )
    .bind(version_id, version.id, now, email, now, now, link.contentId)
    .run();
  return version_id;
}

type PlanningStatus = {
  posts: { id: string; status: string; current_version_id: string | null; archived_at: string | null }[];
  approvals: { post_id: string; version_id: string; decision: string; note: string | null; decided_at: string; profile: { full_name: string | null } | null }[];
  comments: { post_id: string; version_id: string | null; body: string; pos_x: number | null; created_at: string; profile: { full_name: string | null; role: string } | null }[];
};

/**
 * Traz para o OxyStudio o que aconteceu no OxyPlanning: decisão do cliente, comentários
 * e artes enviadas direto por lá. Só muda pautas ligadas; nunca escreve no OxyPlanning.
 */
export async function syncFromPlanning() {
  const links = (await contentLinks()).filter((l) => l.planningStatus !== 'published');
  if (!links.length) return { updated: 0 };
  const db = database();
  const ids = links.map((l) => l.contentId);
  const items = (
    await db
      .prepare(`SELECT id, status FROM content_items WHERE deletedAt IS NULL AND id IN (${ids.map(() => '?').join(',')})`)
      .bind(...ids)
      .all<{ id: string; status: string }>()
  ).results;
  const byId = new Map(items.map((i) => [i.id, i]));
  const data = await ponte<PlanningStatus>({ action: 'status', post_ids: links.map((l) => l.postId) });
  const posts = new Map(data.posts.map((p) => [p.id, p]));
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  let updated = 0;

  for (const link of links) {
    const item = byId.get(link.contentId);
    const post = posts.get(link.postId);
    if (!item || !post) continue;
    const latest = await db
      .prepare('SELECT id FROM content_versions WHERE contentId=? ORDER BY number DESC LIMIT 1')
      .bind(item.id)
      .first<{ id: string }>();
    const set = (status: string, note?: string) => {
      if (item.status === status) return;
      statements.push(db.prepare('UPDATE content_items SET status=?, revision=COALESCE(revision,0)+1 WHERE id=? AND status=?').bind(status, item.id, item.status));
      if (latest && ['APROVADO', 'ALTERAÇÃO'].includes(status))
        statements.push(
          db.prepare('INSERT INTO approvals (id, contentId, versionId, decision, createdAt, userId) VALUES (?,?,?,?,?,NULL)').bind(crypto.randomUUID(), item.id, latest.id, status, now),
        );
      if (status === 'APROVADO' && latest) statements.push(db.prepare('UPDATE content_versions SET locked=1 WHERE id=?').bind(latest.id));
      if (note) statements.push(db.prepare('INSERT INTO comments (id, contentId, text, createdAt, user) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(), item.id, note, now, 'OxyPlanning'));
      updated++;
    };

    const ours = !!link.sentVersionId && post.current_version_id === link.sentVersionId;
    if (!link.sentVersionId || !ours) {
      // Arte enviada direto no OxyPlanning: uma versão nova por lá depois que a pauta entrou em produção aqui.
      // Sem a versão de partida registrada (pautas antigas), não dá para afirmar: não mexe.
      if (link.baseVersionId && post.current_version_id && ['awaiting', 'changes_requested', 'approved', 'published'].includes(post.status) && post.current_version_id !== link.sentVersionId && post.current_version_id !== link.baseVersionId) {
        const target = post.status === 'published' ? 'PUBLICADO' : post.status === 'approved' ? 'APROVADO' : 'APROVAÇÃO';
        if (!['APROVADO', 'PUBLICADO'].includes(item.status) || target === 'PUBLICADO')
          set(target, 'Arte enviada direto no OxyPlanning. Esta pauta saiu da fila de produção do OxyStudio.');
      }
    } else {
      // Comentários do cliente desde o último sincronismo
      const fresh = data.comments.filter((c) => c.post_id === link.postId && c.version_id === link.sentVersionId && (!link.lastCommentAt || c.created_at > link.lastCommentAt));
      for (const c of fresh)
        statements.push(
          db.prepare('INSERT INTO comments (id, contentId, text, createdAt, user) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(), item.id, (c.pos_x != null ? '📍 Marcação na arte: ' : '') + c.body, c.created_at, (c.profile?.full_name || 'Cliente') + ' (OxyPlanning)'),
        );
      const decision = data.approvals.find((a) => a.post_id === link.postId && a.version_id === link.sentVersionId);
      if (post.status === 'published') set('PUBLICADO');
      else if (post.status === 'approved') set('APROVADO', decision ? `Aprovado no OxyPlanning por ${decision.profile?.full_name || 'cliente'}.` : undefined);
      else if (post.status === 'changes_requested' && item.status === 'APROVAÇÃO')
        set('ALTERAÇÃO', `Alteração pedida no OxyPlanning${decision?.profile?.full_name ? ' por ' + decision.profile.full_name : ''}${decision?.note ? ': ' + decision.note : '.'}`);
      if (fresh.length) link.lastCommentAt = fresh[fresh.length - 1].created_at;
    }
    statements.push(
      db.prepare('UPDATE planning_content_links SET planningStatus=?, lastCommentAt=?, syncedAt=? WHERE contentId=?').bind(post.archived_at ? 'archived' : post.status, link.lastCommentAt, now, link.contentId),
    );
  }
  if (statements.length) await db.batch(statements);
  return { updated };
}

let lastSync = 0;
/** Sincronismo leve ao abrir o workspace: no máximo a cada 2 min e sem travar a tela (4 s). */
export async function syncFromPlanningSoon() {
  if (!planningConfigured() || Date.now() - lastSync < 120_000) return;
  lastSync = Date.now();
  await Promise.race([syncFromPlanning().catch((e) => console.error('oxyplanning sync', e)), new Promise((r) => setTimeout(r, 4000))]);
}

/**
 * Pautas em produção que ainda não foram enviadas daqui: registra a versão de partida (pautas antigas)
 * e, se a publicação continua sem arquivo no OxyPlanning, desfaz a marcação indevida de
 * "arte enviada direto" (que tirava a pauta da produção). Devolve quantos conteúdos voltaram.
 */
export async function adoptBaseVersions(posts: { id: string; current_version_id: string | null; media_count?: number }[]) {
  const open = (await contentLinks()).filter((l) => !l.sentVersionId);
  if (!open.length) return 0;
  const db = database();
  const byPost = new Map(posts.map((p) => [p.id, p]));
  const statements: D1PreparedStatement[] = [];
  let reverted = 0;
  for (const l of open) {
    const post = byPost.get(l.postId);
    if (!post?.current_version_id || typeof post.media_count !== 'number') continue;
    if (!l.baseVersionId) statements.push(db.prepare('UPDATE planning_content_links SET baseVersionId=? WHERE contentId=?').bind(post.current_version_id, l.contentId));
    const sameVersion = !l.baseVersionId || l.baseVersionId === post.current_version_id;
    if (sameVersion && post.media_count === 0) {
      const item = await db.prepare("SELECT status FROM content_items WHERE id=?").bind(l.contentId).first<{ status: string }>();
      if (item?.status === 'APROVAÇÃO') {
        statements.push(db.prepare("UPDATE content_items SET status='PLANEJADO', revision=COALESCE(revision,0)+1 WHERE id=? AND status='APROVAÇÃO'").bind(l.contentId));
        statements.push(db.prepare("DELETE FROM comments WHERE contentId=? AND user='OxyPlanning' AND text LIKE 'Arte enviada direto no OxyPlanning%'").bind(l.contentId));
        reverted++;
      }
    }
  }
  if (statements.length) await db.batch(statements);
  return reverted;
}

/**
 * Artes que o cliente já aprovou no OxyPlanning: referência de estilo ("a linha criativa dele")
 * para a IA. Só leitura; devolve no formato de entrada da OpenAI. Sem ligação ou com falha, vem vazio.
 */
export async function planningStyleReferences(brandId: string, limit = 4) {
  const empty = { images: [] as { asset: { id: string; name: string; category: string }; file: File }[], content: [] as Record<string, unknown>[] };
  if (!planningConfigured()) return empty;
  try {
    const link = (await brandLinks()).find((l) => l.brandId === brandId);
    if (!link) return empty;
    const { refs } = await ponte<{ refs: { post_id: string; title: string; url: string; mime: string }[] }>({ action: 'referencias', client_id: link.clientId, limit });
    for (const r of refs) {
      const res = await fetch(r.url, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
      if (!res?.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (!bytes.length || bytes.length > 6 * 1024 * 1024) continue;
      const name = `Aprovada pelo cliente no OxyPlanning: ${r.title || 'publicação'}`.slice(0, 160);
      empty.images.push({ asset: { id: 'planning-' + r.post_id, name, category: 'approved_planning' }, file: new File([bytes], 'referencia.' + (r.mime.split('/')[1] || 'png'), { type: r.mime }) });
      empty.content.push({ type: 'input_text', text: JSON.stringify({ arquivo: name, categoria: 'arte aprovada pelo cliente', orientacao: 'Referência da linha criativa atual do cliente: siga o estilo, a tipografia, as cores e a composição. Não copie os textos.' }) });
      let binary = '';
      for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
      empty.content.push({ type: 'input_image', image_url: `data:${r.mime};base64,${btoa(binary)}`, detail: 'high' });
    }
  } catch (e) {
    console.error('oxyplanning references', e);
  }
  return empty;
}

/**
 * Peça criada no editor "Criar" (sem publicação de origem no OxyPlanning): cria o post no
 * cliente ligado à marca, já com a arte e enviado para aprovação, e guarda a ligação para a
 * sincronização de decisões e comentários funcionar como nas pautas vindas de lá.
 */
export async function createInPlanning(opts: {
  brandLink: BrandLink;
  item: { id: string; title: string; pillar: string; objective: string; format: string; date: string };
  version: VersionRow;
  email: string;
}) {
  const { brandLink, item, version, email } = opts;
  await ensurePlanningTables();
  const urls = filesOf(item, version);
  if (!urls.length) throw new Error('Anexe a arte antes de enviar ao cliente.');
  const { uploads, files } = await uploadToPlanning(brandLink.clientId, urls);
  let hashtags: string[] = [];
  try {
    hashtags = JSON.parse(version.hashtags || '[]');
  } catch {
    hashtags = (version.hashtags || '').split(/[\s,]+/).filter(Boolean);
  }
  const { post_id, version_id } = await ponte<{ post_id: string; version_id: string | null }>({
    action: 'criar',
    client_id: brandLink.clientId,
    email,
    date: item.date,
    format: item.format === 'Carrossel' ? 'carousel' : 'static',
    content: {
      title: item.title,
      theme: item.pillar,
      objective: item.objective,
      art_text: [version.headline, version.copy].filter(Boolean).join('\n\n'),
      caption: version.caption,
      hashtags,
    },
    media: uploads.map((u, i) => ({ storage_path: u.storage_path, file_name: files[i].name, mime_type: files[i].mime, size_bytes: files[i].size })),
  });
  const now = new Date().toISOString();
  await database()
    .prepare(
      "INSERT INTO planning_content_links (contentId, postId, clientId, sentVersionId, sentContentVersionId, sentAt, sentBy, planningStatus, lastCommentAt, syncedAt, createdAt) VALUES (?,?,?,?,?,?,?,'awaiting',?,?,?)",
    )
    .bind(item.id, post_id, brandLink.clientId, version_id, version.id, now, email, now, now, now)
    .run();
  return post_id;
}

/**
 * Arte (imagem, carrossel ou vídeo) feita no OxyStudio A PARTIR de uma pauta do OxyPlanning: liga a
 * peça à publicação e envia como nova versão dessa mesma publicação, para aprovação do cliente.
 * Se a publicação já estava ligada a outra peça do OxyStudio, a ligação passa para esta.
 */
export async function sendToPlanningPost(opts: {
  postId: string;
  item: { id: string; brandId: string; title: string; pillar: string; objective: string; format: string };
  version: VersionRow;
  email: string;
}) {
  const { postId, item, version, email } = opts;
  await ensurePlanningTables();
  const link = (await brandLinks()).find((l) => l.brandId === item.brandId);
  if (!link) throw new Error('A marca não está ligada a um cliente do OxyPlanning.');
  const { posts } = await ponte<{ posts: { id: string; client_id: string; status: string; current_version_id: string | null }[] }>({
    action: 'pautas',
    client_ids: [link.clientId],
    from: '2000-01-01',
  });
  const post = posts.find((p) => p.id === postId);
  if (!post) throw new Error('Pauta não encontrada no OxyPlanning deste cliente.');
  if (post.status === 'approved' || post.status === 'published') throw new Error('Esta pauta já foi aprovada no OxyPlanning.');
  const db = database();
  const now = new Date().toISOString();
  await db.batch([
    db.prepare('DELETE FROM planning_content_links WHERE contentId=? AND postId<>?').bind(item.id, postId),
    db
      .prepare(
        'INSERT INTO planning_content_links (contentId, postId, clientId, planningStatus, createdAt, baseVersionId) VALUES (?,?,?,?,?,?) ON CONFLICT(postId) DO UPDATE SET contentId=excluded.contentId',
      )
      .bind(item.id, postId, link.clientId, post.status, now, post.current_version_id),
  ]);
  const row = await contentLink(item.id);
  if (!row) throw new Error('Não foi possível ligar a peça à pauta.');
  await sendToPlanning({ link: row, item, version, email });
  return link.clientName;
}
