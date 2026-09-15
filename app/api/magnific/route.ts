import { authorize } from '@/lib/auth';
import { database, bucket, readState } from '@/lib/repository';
import { activeWorkspace, apiAlert } from '@/lib/workspaces';
import { magnificRequest, MagnificError } from '@/lib/magnific-client';
import {
  magnificKey,
  syncMagnific,
  type MagnificJob,
} from '@/lib/magnific-jobs';
import { base64 } from '@/lib/creative-materials';
export async function GET(request: Request) {
  const user = authorize(request);
  if (user instanceof Response) return user;
  try {
    const w = await activeWorkspace(request);
    const contentId = new URL(request.url).searchParams.get('contentId');
    if (contentId) {
      const jobs = await database()
        .prepare(
          'SELECT * FROM magnific_jobs WHERE workspaceId=? AND contentId=? ORDER BY createdAt DESC LIMIT 5',
        )
        .bind(w.id, contentId)
        .all<MagnificJob>();
      return Response.json(
        { jobs: jobs.results },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (!magnificKey())
      return Response.json({
        configured: false,
        message: 'Chave Magnific não configurada.',
      });
    await magnificRequest(magnificKey());
    return Response.json({
      configured: true,
      connected: true,
      message:
        'Magnific conectado. Geração de novas artes disponível no Studio. Créditos são cobrados na conta da API.',
    });
  } catch (e) {
    return Response.json({
      configured: !!magnificKey(),
      connected: false,
      message:
        e instanceof MagnificError
          ? e.message
          : 'Não foi possível verificar Magnific.',
    });
  }
}
export async function POST(request: Request) {
  const user = authorize(request);
  if (user instanceof Response) return user;
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return new Response(null, { status: 403 });
  let jobId = '';
  let submitted = false;
  try {
    const data = (await request.json()) as {
      action?: string;
      jobId?: string;
      contentId?: string;
      format?: string;
      prompt?: string;
      assetIds?: string[];
    };
    const w = await activeWorkspace(request);
    if (data.action === 'sync') {
      const job = await database()
        .prepare('SELECT * FROM magnific_jobs WHERE id=? AND workspaceId=?')
        .bind(data.jobId || '', w.id)
        .first<MagnificJob>();
      if (!job) throw new Error('Pedido não encontrado.');
      return Response.json({ job: await syncMagnific(job) });
    }
    const state = await readState(request);
    const item = state.contents.find((c) => c.id === data.contentId);
    if (!item) throw new Error('Conteúdo não encontrado.');
    if (['APROVAÇÃO', 'APROVADO', 'PUBLICADO'].includes(item.status))
      throw new Error('Solicite uma alteração antes de gerar outra arte.');
    if (
      !['Feed', 'Story'].includes(data.format || '') ||
      !item.format.includes(data.format!)
    )
      throw new Error('Formato inválido.');
    const prompt =
      typeof data.prompt === 'string' ? data.prompt.trim().slice(0, 6000) : '';
    if (!prompt) throw new Error('Descreva o criativo.');
    const ids = data.assetIds;
    if (
      !Array.isArray(ids) ||
      ids.length > 4 ||
      new Set(ids).size !== ids.length
    )
      throw new Error('Selecione até quatro referências.');
    const refs = ids.map((id) =>
      state.assets.find(
        (a) =>
          a.id === id &&
          a.brandId === item.brandId &&
          ['image/png', 'image/jpeg', 'image/webp'].includes(a.mime),
      ),
    );
    if (refs.some((a) => !a)) throw new Error('Selecione imagens desta marca.');
    const brand = state.brands.find((b) => b.id === item.brandId)!;
    const body: Record<string, unknown> = {
      prompt: JSON.stringify({
        pedido: prompt,
        tema: item.title,
        briefing: item.brief,
        marca: brand.name,
        regras: brand.rules,
        cores: brand.colors,
        direcao: brand.direction,
        orientacao:
          'Use os produtos e logotipos das imagens de referência com fidelidade. Não invente características.',
        referencias: refs.map((a) => ({
          nome: a!.name,
          categoria: a!.category,
          descricao: a!.description,
          orientacao: a!.aiNotes,
        })),
      }),
      width: data.format === 'Feed' ? 1024 : 768,
      height: data.format === 'Feed' ? 1280 : 1360,
      prompt_upsampling: false,
    };
    let total = 0;
    for (let i = 0; i < refs.length; i++) {
      const a = refs[i]!;
      const object = await bucket().get('brands/' + a.brandId + '/' + a.id);
      if (!object) throw new Error('Referência indisponível.');
      total += object.size;
      if (total > 20 * 1024 * 1024)
        throw new Error('Use até 20 MB de referências.');
      body[i === 0 ? 'input_image' : 'input_image_' + (i + 1)] = base64(
        new Uint8Array(await object.arrayBuffer()),
      );
    }
    if (!magnificKey())
      throw new MagnificError('Chave Magnific não configurada.');
    jobId = crypto.randomUUID();
    const now = new Date().toISOString();
    const reserved = await database()
      .prepare(
        "INSERT INTO magnific_jobs (id,workspaceId,contentId,brandId,taskId,status,format,assetId,revision,message,createdAt) SELECT ?,?,?,?,'','submitting',?,?,?,'',? WHERE NOT EXISTS (SELECT 1 FROM magnific_jobs WHERE contentId=? AND status IN ('pending','submitting','unknown'))",
      )
      .bind(
        jobId,
        w.id,
        item.id,
        item.brandId,
        data.format!,
        crypto.randomUUID(),
        item.revision || 0,
        now,
        item.id,
      )
      .run();
    if (!reserved.meta.changes) {
      jobId = '';
      throw new Error('Já existe uma geração em andamento para este conteúdo.');
    }
    submitted = true;
    const result = await magnificRequest(magnificKey(), undefined, body);
    const task = result.data.task_id;
    if (!task)
      throw new MagnificError(
        'Magnific não retornou o identificador. Confira sua conta antes de repetir.',
        true,
      );
    await database()
      .prepare("UPDATE magnific_jobs SET taskId=?,status='pending' WHERE id=?")
      .bind(task, jobId)
      .run();
    return Response.json({ ok: true, jobId });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Não foi possível gerar.';
    if (jobId)
      await database()
        .prepare('UPDATE magnific_jobs SET status=?,message=? WHERE id=?')
        .bind(
          submitted && (!(e instanceof MagnificError) || e.uncertain)
            ? 'unknown'
            : 'failed',
          message,
          jobId,
        )
        .run()
        .catch(() => {});
    if (e instanceof MagnificError)
      await apiAlert(request, 'Magnific', message).catch(() => {});
    return Response.json({ error: message }, { status: 400 });
  }
}
