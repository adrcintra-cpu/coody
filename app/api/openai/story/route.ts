import { env } from 'cloudflare:workers';
import { apiAlert } from '@/lib/workspaces';
import { authorize } from '@/lib/auth';
import { OpenAIError, openaiRequest } from '@/lib/openai-client';
import { bucket, database, readState } from '@/lib/repository';
import { validateUpload } from '@/lib/asset-upload';
import { storyAdaptationId } from '@/lib/domain';
import {
  STORY_AI_MARKER,
  STORY_SIZE,
  storyRecomposePrompt,
} from '@/lib/story-recompose';

const model = 'gpt-image-2';
function apiKey() {
  return (env as unknown as Record<string, string>).OPENAI_API_KEY || '';
}

/**
 * Recomposes the Story (9:16) from the saved Feed art of the latest version.
 * The Feed art itself is the model input, so the Story stays the same
 * creation. The result is stored as story-<source id>, replacing any earlier
 * Story for that art.
 */
export async function POST(request: Request) {
  const user = authorize(request);
  if (user instanceof Response) return user;
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  if (!apiKey())
    return Response.json(
      { error: 'Configure a chave OpenAI no servidor para recompor o Story.' },
      { status: 503 },
    );
  let reserved = false;
  let requestId = '';
  try {
    const data = (await request.json()) as {
      contentId?: unknown;
      requestId?: unknown;
    };
    requestId = typeof data.requestId === 'string' ? data.requestId : '';
    if (!/^[a-f0-9-]{36}$/.test(requestId)) throw new Error('Pedido inválido.');
    const state = await readState(request);
    const item = state.contents.find((c) => c.id === data.contentId);
    if (!item) throw new Error('Pauta não encontrada.');
    if (!item.format.includes('Story'))
      throw new Error('Esta pauta não tem formato Story.');
    if (['APROVAÇÃO', 'APROVADO', 'PUBLICADO'].includes(item.status))
      throw new Error(
        'Esta pauta está protegida. Solicite alteração antes de recompor o Story.',
      );
    const version = state.versions
      .filter((v) => v.contentId === item.id)
      .sort((a, b) => b.number - a.number)[0];
    const sourceId = /^\/api\/assets\/([A-Za-z0-9-]+)$/.exec(
      version?.feedUrl || '',
    )?.[1];
    const source = state.assets.find(
      (a) =>
        a.id === sourceId &&
        a.brandId === item.brandId &&
        a.mime.startsWith('image/'),
    );
    if (!source)
      throw new Error(
        'Salve uma versão com a arte do Feed antes de recompor o Story.',
      );
    const storyId = storyAdaptationId(source.url);
    if (!storyId) throw new Error('Arte de origem inválida.');
    // Same single-flight guard as the creative generation: one paid image
    // request at a time per workspace.
    const reservation = await database()
      .prepare(
        "INSERT INTO image_requests (id,contentId,status,assetId,createdAt) SELECT ?,?,'pending','',? WHERE NOT EXISTS (SELECT 1 FROM image_requests WHERE status='pending' AND createdAt>?)",
      )
      .bind(
        requestId,
        item.id,
        new Date().toISOString(),
        new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      )
      .run();
    if (!reservation.meta.changes)
      throw new Error(
        'Há uma imagem em geração. Aguarde a conclusão antes de iniciar outra.',
      );
    reserved = true;
    const object = await bucket().get(
      'brands/' + source.brandId + '/' + source.id,
    );
    if (!object) throw new Error('A arte do Feed não está disponível.');
    const brand = state.brands.find((b) => b.id === item.brandId)!;
    const form = new FormData();
    form.append('model', model);
    form.append('n', '1');
    form.append('size', STORY_SIZE);
    form.append('quality', 'high');
    form.append('output_format', 'png');
    form.append(
      'prompt',
      storyRecomposePrompt({
        headline: version.headline,
        copy: version.copy,
        brandName: brand.name,
        colors: brand.colors,
        fonts: brand.fonts,
      }),
    );
    form.append(
      'image[]',
      new File([await object.arrayBuffer()], source.name, {
        type: source.mime,
      }),
    );
    const result = await openaiRequest(apiKey(), 'images/edits', form);
    const encoded = (result.data as { b64_json?: string }[] | undefined)?.[0]
      ?.b64_json;
    if (!encoded || encoded.length > 28 * 1024 * 1024)
      throw new OpenAIError('A OpenAI devolveu uma imagem vazia ou muito grande.');
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    await validateUpload(
      new File([bytes], 'story-9x16.png', { type: 'image/png' }),
    );
    await bucket().put('brands/' + source.brandId + '/' + storyId, bytes, {
      httpMetadata: { contentType: 'image/png' },
    });
    const now = new Date().toISOString();
    await database()
      .prepare(
        `INSERT INTO brand_assets (id,brandId,name,category,mime,url,description,aiNotes,priority,approved,createdAt,updatedAt)
         VALUES (?,?,?,?,?,?,?,?,0,0,?,?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name, mime=excluded.mime, description=excluded.description, aiNotes=excluded.aiNotes, updatedAt=excluded.updatedAt`,
      )
      .bind(
        storyId,
        source.brandId,
        ('Story 9:16 · ' + source.name).slice(0, 200),
        'material',
        'image/png',
        '/api/assets/' + storyId,
        STORY_AI_MARKER + ' a partir de "' + source.name + '".',
        'Gerado com OpenAI (' + model + '). Revise lado a lado com o Feed antes de aprovar.',
        now,
        now,
      )
      .run();
    await database()
      .prepare("UPDATE image_requests SET status='complete',assetId=? WHERE id=?")
      .bind(storyId, requestId)
      .run();
    return Response.json({ ok: true, url: '/api/assets/' + storyId });
  } catch (error) {
    if (reserved)
      await database()
        .prepare(
          "UPDATE image_requests SET status='failed' WHERE id=? AND status='pending'",
        )
        .bind(requestId)
        .run()
        .catch(() => {});
    const message =
      error instanceof Error &&
      !['TimeoutError', 'TypeError', 'SyntaxError'].includes(error.name)
        ? error.message
        : 'Não foi possível recompor o Story. Tente novamente.';
    if (error instanceof OpenAIError)
      await apiAlert(request, 'OpenAI', message).catch(() => {});
    return Response.json({ error: message }, { status: 400 });
  }
}
