import { authorize, forbid } from '@/lib/auth';
import { database, insert } from '@/lib/repository';
import { activeWorkspace, assertBrandWorkspace } from '@/lib/workspaces';
import {
  cleanRequest,
  ensureVideoTables,
  publicJob,
  workerConfigured,
  WORKER_ONLINE_MS,
  type JobRow,
  type VideoRequest,
} from '@/lib/video';

/**
 * Video & Motion: tela do OxyStudio.
 * GET → produções do workspace, estado do worker (motores, fila, pastas liberadas).
 * POST { action: 'create', brandId, request } → entra na fila do worker.
 * POST { action: 'revise', id, instructions } → nova versão (a anterior fica guardada).
 * POST { action: 'cancel', id } → cancela uma produção que ainda não terminou.
 * POST { action: 'approve', id } → marca a versão como aprovada (não publica nada).
 */

const guard = (request: Request) =>
  request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin
    ? Response.json({ error: 'Origem inválida.' }, { status: 403 })
    : null;

export async function GET(request: Request) {
  const user = await authorize(request);
  if (user instanceof Response) return user;
  try {
    await ensureVideoTables();
    const w = await activeWorkspace(request);
    const jobs = await database()
      .prepare('SELECT * FROM video_jobs WHERE workspaceId=? ORDER BY createdAt DESC LIMIT 80')
      .bind(w.id)
      .all<JobRow>();
    const workers = await database().prepare('SELECT * FROM video_workers ORDER BY lastSeen DESC LIMIT 5').all<{ id: string; name: string; lastSeen: string; info: string }>();
    const now = Date.now();
    const list = workers.results.map((r) => {
      let info: Record<string, unknown> = {};
      try {
        info = JSON.parse(r.info);
      } catch {
        /* vazio */
      }
      return { id: r.id, name: r.name, lastSeen: r.lastSeen, online: now - Date.parse(r.lastSeen) < WORKER_ONLINE_MS, ...info };
    });
    const queued = await database()
      .prepare("SELECT COUNT(*) AS n FROM video_jobs WHERE status IN ('queued','running')")
      .first<{ n: number }>();
    return Response.json(
      {
        configured: workerConfigured(),
        workers: list,
        queue: Number(queued?.n ?? 0),
        jobs: jobs.results.map(publicJob),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Falha ao carregar.' }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const user = await authorize(request);
  if (user instanceof Response) return user;
  {
    const denied = forbid(user, 'edit');
    if (denied) return denied;
  }
  const bad = guard(request);
  if (bad) return bad;
  try {
    const raw = await request.text();
    if (raw.length > 80_000) throw new Error('Pedido muito grande.');
    const data = JSON.parse(raw) as Record<string, unknown>;
    await ensureVideoTables();
    const w = await activeWorkspace(request);
    const now = new Date().toISOString();
    const db = database();

    if (data.action === 'create') {
      const brandId = typeof data.brandId === 'string' ? data.brandId : '';
      await assertBrandWorkspace(request, brandId);
      const req = cleanRequest((data.request ?? {}) as Record<string, unknown>);
      await assertAssets(brandId, req);
      const id = crypto.randomUUID();
      await db
        .prepare(
          "INSERT INTO video_jobs (id,workspaceId,brandId,title,status,stage,progress,request,version,rootId,createdBy,createdAt,updatedAt,sourceRef) VALUES (?,?,?,?,'queued','Na fila',0,?,1,?,?,?,?,?)",
        )
        .bind(id, w.id, brandId, req.briefing.slice(0, 80), JSON.stringify(req), id, user.email, now, now, typeof data.sourceRef === 'string' ? data.sourceRef.slice(0, 400) : null)
        .run();
      await log(user.id, 'video.create', id, req.type);
      return Response.json({ ok: true, id });
    }

    const job = await db
      .prepare('SELECT * FROM video_jobs WHERE id=? AND workspaceId=?')
      .bind(typeof data.id === 'string' ? data.id : '', w.id)
      .first<JobRow>();
    if (!job) throw new Error('Produção não encontrada.');

    if (data.action === 'revise') {
      const instructions = typeof data.instructions === 'string' ? data.instructions.trim().slice(0, 3000) : '';
      if (!instructions) throw new Error('Diga o que mudar.');
      if (!['review', 'approved'].includes(job.status) || !job.plan) throw new Error('Só dá para pedir alteração de uma versão pronta.');
      const req = { ...(JSON.parse(job.request) as VideoRequest), revision: instructions };
      const max = await db.prepare('SELECT MAX(version) AS v FROM video_jobs WHERE rootId=?').bind(job.rootId).first<{ v: number }>();
      const id = crypto.randomUUID();
      // A versão nova parte do plano e da análise da anterior (o worker não reanalisa os arquivos).
      await db
        .prepare(
          "INSERT INTO video_jobs (id,workspaceId,brandId,title,status,stage,progress,request,analysis,plan,version,rootId,parentId,createdBy,createdAt,updatedAt,sourceRef) VALUES (?,?,?,?,'queued','Na fila',0,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(id, w.id, job.brandId, job.title, JSON.stringify(req), job.analysis, job.plan, Number(max?.v ?? job.version) + 1, job.rootId, job.id, user.email, now, now, job.sourceRef)
        .run();
      await log(user.id, 'video.revise', id, instructions.slice(0, 200));
      return Response.json({ ok: true, id });
    }

    if (data.action === 'cancel') {
      if (!['queued', 'running'].includes(job.status)) throw new Error('Esta produção já terminou.');
      await db
        .prepare("UPDATE video_jobs SET status='cancelled',stage='Cancelada',updatedAt=?,finishedAt=? WHERE id=? AND status IN ('queued','running')")
        .bind(now, now, job.id)
        .run();
      await log(user.id, 'video.cancel', job.id, '');
      return Response.json({ ok: true });
    }

    if (data.action === 'approve') {
      if (job.status !== 'review') throw new Error('Só dá para aprovar uma versão pronta.');
      await db.prepare("UPDATE video_jobs SET status='approved',stage='Aprovada',updatedAt=? WHERE id=?").bind(now, job.id).run();
      await log(user.id, 'video.approve', job.id, '');
      return Response.json({ ok: true });
    }
    throw new Error('Ação inválida.');
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Falha.' }, { status: 400 });
  }
}

/** Arquivos da biblioteca usados na produção precisam ser da mesma marca. */
async function assertAssets(brandId: string, req: VideoRequest) {
  const ids = [...req.assetIds, ...(req.musicAssetId ? [req.musicAssetId] : [])];
  if (!ids.length) return;
  const rows = await database()
    .prepare(`SELECT id FROM brand_assets WHERE brandId=? AND id IN (${ids.map(() => '?').join(',')})`)
    .bind(brandId, ...ids)
    .all<{ id: string }>();
  if (rows.results.length !== new Set(ids).size) throw new Error('Algum arquivo escolhido não é desta marca.');
}

async function log(userId: string, action: string, entityId: string, detail: string) {
  await insert('activity_logs', {
    id: crypto.randomUUID(),
    userId,
    action: `${action}${detail ? ': ' + detail : ''}`.slice(0, 500),
    entityId,
    createdAt: new Date().toISOString(),
  })
    .run()
    .catch(() => undefined);
}
