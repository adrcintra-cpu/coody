import { env } from 'cloudflare:workers';
import { apiAlert } from '@/lib/workspaces';
import { authorize, forbid } from '@/lib/auth';
import { activeState } from '@/lib/brand-lifecycle';
import { OpenAIError, openaiRequest } from '@/lib/openai-client';
import { bucket, database, insert, readState } from '@/lib/repository';
import { assetRecord, validateUpload } from '@/lib/asset-upload';

/**
 * Ajuste: a fine adjustment of the SAME art. The current art is the input of
 * the image model, which changes only what was asked (text, color, position,
 * detail) and keeps everything else. The result becomes a new version with
 * the same texts, in review.
 */
const model = 'gpt-image-2';
const apiKey = () => (env as unknown as Record<string, string>).OPENAI_API_KEY || '';

export async function POST(request: Request) {
  const user = await authorize(request);
  if (user instanceof Response) return user;
  { const denied = forbid(user, 'edit'); if (denied) return denied; }
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  if (!apiKey())
    return Response.json({ error: 'Configure a chave OpenAI no servidor para ajustar com IA.' }, { status: 503 });
  let reserved = false;
  let requestId = '';
  try {
    const data = (await request.json()) as { contentId?: unknown; requestId?: unknown; instruction?: unknown };
    requestId = typeof data.requestId === 'string' ? data.requestId : '';
    if (!/^[a-f0-9-]{36}$/.test(requestId)) throw new Error('Pedido inválido.');
    const instruction = typeof data.instruction === 'string' ? data.instruction.trim().slice(0, 2000) : '';
    if (!instruction) throw new Error('Descreva o ajuste.');
    const state = activeState(await readState(request));
    const item = state.contents.find((c) => c.id === data.contentId);
    if (!item) throw new Error('Pauta não encontrada.');
    if (['APROVAÇÃO', 'APROVADO', 'PUBLICADO'].includes(item.status))
      throw new Error('Esta pauta está protegida. Peça um ajuste antes de editar a arte.');
    const version = state.versions.filter((v) => v.contentId === item.id).sort((a, b) => b.number - a.number)[0];
    const sourceId = /^\/api\/assets\/([A-Za-z0-9-]+)$/.exec(version?.feedUrl || '')?.[1];
    const source = state.assets.find((a) => a.id === sourceId && a.brandId === item.brandId && a.mime.startsWith('image/'));
    if (!source) throw new Error('Esta peça não tem uma arte para ajustar. Gere ou envie a arte primeiro.');
    const reservation = await database()
      .prepare(
        "INSERT INTO image_requests (id,contentId,status,assetId,createdAt) SELECT ?,?,'pending','',? WHERE NOT EXISTS (SELECT 1 FROM image_requests WHERE status='pending' AND createdAt>?)",
      )
      .bind(requestId, item.id, new Date().toISOString(), new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .run();
    if (!reservation.meta.changes) throw new Error('Há uma imagem em geração. Aguarde a conclusão antes de iniciar outra.');
    reserved = true;
    const object = await bucket().get('brands/' + source.brandId + '/' + source.id);
    if (!object) throw new Error('A arte atual não está disponível.');
    const form = new FormData();
    form.append('model', model);
    form.append('n', '1');
    form.append('size', item.format === 'Story' ? '1152x2048' : '1024x1280');
    form.append('quality', 'high');
    form.append('output_format', 'png');
    form.append(
      'prompt',
      [
        'Você recebeu a ARTE FINAL aprovável de um post. Faça SOMENTE este ajuste fino pedido pelo cliente: ' + JSON.stringify(instruction) + '.',
        'Mantenha todo o resto idêntico: mesma composição, mesma foto e produto, mesmo logotipo, mesmas cores, mesma tipografia e os mesmos textos com a grafia exata (exceto se o ajuste pedir para mudar um texto).',
        'Não crie uma nova arte, não reposicione elementos que não foram citados e não acrescente elementos.',
      ].join(' '),
    );
    form.append('image[]', new File([await object.arrayBuffer()], source.name, { type: source.mime }));
    const result = await openaiRequest(apiKey(), 'images/edits', form);
    const encoded = (result.data as { b64_json?: string }[] | undefined)?.[0]?.b64_json;
    if (!encoded || encoded.length > 28 * 1024 * 1024) throw new OpenAIError('A OpenAI devolveu uma imagem vazia ou muito grande.');
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const file = new File([bytes], 'ajuste-openai.png', { type: 'image/png' });
    await validateUpload(file);
    const asset = assetRecord(file, item.brandId, {
      name: (item.title + ' · ajuste IA').slice(0, 200),
      category: 'visual_reference',
      description: 'Ajuste: ' + instruction,
      aiNotes: 'Criativo gerado com OpenAI (ajuste da versão V' + version.number + '). Revisão humana necessária.',
    });
    await bucket().put('brands/' + item.brandId + '/' + asset.id, bytes, { httpMetadata: { contentType: 'image/png' } });
    await insert('brand_assets', asset).run();
    const versionId = crypto.randomUUID();
    await database().batch([
      insert('content_versions', {
        id: versionId,
        contentId: item.id,
        number: version.number + 1,
        headline: version.headline,
        copy: version.copy,
        caption: version.caption,
        hashtags: version.hashtags,
        feedUrl: asset.url,
        storyUrl: asset.url,
        change: ('Ajuste com IA: ' + instruction).slice(0, 6000),
        createdAt: new Date().toISOString(),
        locked: 0,
      }),
      database()
        .prepare('UPDATE content_items SET revision=COALESCE(revision,0)+1 WHERE id=?')
        .bind(item.id),
      database().prepare("UPDATE image_requests SET status='complete',assetId=? WHERE id=?").bind(versionId, requestId),
    ]);
    return Response.json({ ok: true, versionId, url: asset.url });
  } catch (error) {
    if (reserved)
      await database()
        .prepare("UPDATE image_requests SET status='failed' WHERE id=? AND status='pending'")
        .bind(requestId)
        .run()
        .catch(() => {});
    const message =
      error instanceof Error && !['TimeoutError', 'TypeError', 'SyntaxError'].includes(error.name)
        ? error.message
        : 'Não foi possível ajustar a arte. Tente novamente.';
    if (error instanceof OpenAIError) await apiAlert(request, 'OpenAI', message).catch(() => {});
    return Response.json({ error: message }, { status: 400 });
  }
}
