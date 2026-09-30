import { env } from 'cloudflare:workers';
import { magnificRequest, MagnificError } from './magnific-client';
import { database, bucket, insert } from './repository';
import { validateUpload } from './asset-upload';
export type MagnificJob = {
  id: string;
  workspaceId: string;
  contentId: string;
  brandId: string;
  taskId: string;
  status: string;
  format: string;
  assetId: string;
  revision: number;
  message: string;
  createdAt: string;
};
export function magnificKey() {
  return (env as unknown as Record<string, string>).MAGNIFIC_API_KEY || '';
}
export async function syncMagnific(job: MagnificJob) {
  if (job.status !== 'pending' || !job.taskId) return job;
  const result = await magnificRequest(magnificKey(), job.taskId);
  if (result.data.status === 'FAILED' || result.data.status === 'ERROR') {
    job.status = 'failed';
    job.message =
      'A Magnific não concluiu esta geração. Revise o pedido antes de tentar novamente.';
    await database()
      .prepare(
        'UPDATE magnific_jobs SET status=?,message=? WHERE id=? AND status=?',
      )
      .bind(job.status, job.message, job.id, 'pending')
      .run();
    return job;
  }
  if (result.data.status !== 'COMPLETED') return job;
  const remote = result.data.generated?.[0];
  if (!remote)
    throw new MagnificError('A Magnific concluiu sem entregar uma imagem.');
  const url = new URL(remote);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    !['freepik.com', 'magnific.com', 'magnific.ai', 'freepik.es'].some(
      (h) => url.hostname === h || url.hostname.endsWith('.' + h),
    )
  )
    throw new MagnificError(
      'O resultado usa um endereço não reconhecido. A imagem foi preservada na Magnific para verificação.',
    );
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new MagnificError(
      'Não foi possível salvar a imagem Magnific. Tente atualizar o pedido.',
    );
  const mime = (response.headers.get('content-type') || '').split(';')[0];
  const ext =
    mime === 'image/png'
      ? 'png'
      : mime === 'image/jpeg'
        ? 'jpg'
        : mime === 'image/webp'
          ? 'webp'
          : '';
  if (!ext || Number(response.headers.get('content-length')) > 20 * 1024 * 1024)
    throw new MagnificError(
      'A imagem Magnific excede o formato ou tamanho permitido.',
    );
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Imagem vazia.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 20 * 1024 * 1024) {
      await reader.cancel();
      throw new MagnificError('A imagem excede 20 MB.');
    }
    chunks.push(value);
  }
  const file = new File(
    chunks.map((c) => new Uint8Array(c).buffer),
    'magnific.' + ext,
    { type: mime },
  );
  const { bytes } = await validateUpload(file);
  await bucket().put('brands/' + job.brandId + '/' + job.assetId, bytes, {
    httpMetadata: { contentType: mime },
  });
  const now = new Date().toISOString();
  // Atomically claim completion. Repeated polls/webhooks cannot duplicate assets or versions.
  try {
    await database().batch([
      database()
        .prepare(
          "UPDATE magnific_jobs SET status=CASE WHEN status='pending' THEN 'complete' ELSE NULL END WHERE id=?",
        )
        .bind(job.id),
      insert('brand_assets', {
        id: job.assetId,
        brandId: job.brandId,
        name: 'Magnific · ' + job.format,
        category: 'visual_reference',
        mime,
        url: '/api/assets/' + job.assetId,
        description: 'Arte gerada com Magnific para revisão',
        aiNotes:
          'Criativo gerado por Magnific. Revisar fidelidade de logos e produtos.',
        priority: 0,
        approved: 0,
        createdAt: now,
        updatedAt: now,
      }),
    ]);
  } catch {
    const current = await database()
      .prepare('SELECT status FROM magnific_jobs WHERE id=?')
      .bind(job.id)
      .first<{ status: string }>();
    if (current?.status !== 'complete')
      throw new Error('Não foi possível salvar a imagem.');
    return { ...job, status: 'complete' };
  }
  const latest = await database()
    .prepare(
      'SELECT * FROM content_versions WHERE contentId=? ORDER BY number DESC LIMIT 1',
    )
    .bind(job.contentId)
    .first<Record<string, unknown>>();
  const item = await database()
    .prepare('SELECT * FROM content_items WHERE id=? AND deletedAt IS NULL')
    .bind(job.contentId)
    .first<{ revision: number; status: string }>();
  const requestedChange = job.message;
  job.status = 'complete';
  job.message =
    'Arte salva na Biblioteca. Selecione-a no Studio e revise antes de enviar à aprovação.';
  if (
    item &&
    item.revision === job.revision &&
    !['APROVAÇÃO', 'APROVADO', 'PUBLICADO'].includes(item.status) &&
    latest
  ) {
    try {
      await database().batch([
        database()
          .prepare(
            'UPDATE content_items SET revision=CASE WHEN revision=? AND deletedAt IS NULL THEN revision+1 ELSE NULL END,status=? WHERE id=?',
          )
          .bind(job.revision, 'REVISÃO', job.contentId),
        insert('content_versions', {
          id: crypto.randomUUID(),
          contentId: job.contentId,
          number: Number(latest.number) + 1,
          headline: latest.headline,
          copy: latest.copy,
          caption: latest.caption,
          hashtags: JSON.parse(String(latest.hashtags)),
          // A Magnific result is the single visual source; the Studio adapts
          // this source into both canvases.
          feedUrl: '/api/assets/' + job.assetId,
          storyUrl: '/api/assets/' + job.assetId,
          change: requestedChange.startsWith('Alteração solicitada') ? requestedChange : 'Arte Magnific · ' + job.format,
          createdAt: now,
          locked: 0,
        }),
      ]);
      job.message =
        'Arte aplicada ao Studio em revisão. Confira textos, logotipo e produto antes de enviar à aprovação.';
    } catch {
      /* A concurrent edit is preserved; the generated file remains in the Library. */
    }
  }
  await database()
    .prepare('UPDATE magnific_jobs SET message=? WHERE id=?')
    .bind(job.message, job.id)
    .run();
  return job;
}
