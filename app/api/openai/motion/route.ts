import { env } from 'cloudflare:workers';
import { activeState } from '@/lib/brand-lifecycle';
import { apiAlert } from '@/lib/workspaces';
import { authorize, forbid } from '@/lib/auth';
import { OpenAIError, openaiRequest } from '@/lib/openai-client';
import { bucket, database, insert, readState } from '@/lib/repository';
import { assetRecord, validateUpload } from '@/lib/asset-upload';
import { MOTION_MODEL } from '@/lib/image-model';

/**
 * Motion com IA (Images 2.6): anima a arte atual da peça e devolve um GIF em
 * loop, salvo na biblioteca como entrega. O Studio converte o GIF em MP4 no
 * navegador (Instagram e OxyPlanning não aceitam GIF) e grava a nova versão.
 * A arte salva entra como referência no endpoint de edição, então o motion
 * parte da mesma criação, com os mesmos textos e o mesmo logo.
 */
const apiKey = () => (env as unknown as Record<string, string>).OPENAI_API_KEY || '';
const PROTECTED = ['APROVAÇÃO', 'APROVADO', 'PUBLICADO'];
const STILL = ['image/png', 'image/jpeg', 'image/webp'];
// The API reference caps GIF output at 16 frames.
const FRAMES: Record<string, number> = { curto: 8, medio: 12, longo: 16 };
const SPEED: Record<string, number> = { lento: 220, normal: 140, rapido: 90 };
const STYLE: Record<string, string> = {
  sutil:
    'Movimento SUTIL e elegante: só o fundo, a luz, partículas, reflexos ou elementos decorativos se mexem de leve. Textos, logotipo e produto ficam parados e nítidos em todos os quadros.',
  dinamico:
    'Movimento DINÂMICO de anúncio: os elementos visuais entram e se acomodam, a headline surge com um movimento curto e limpo e fica legível e parada na maior parte do loop. O logotipo fica sempre parado.',
  produto:
    'Destaque do PRODUTO ou do elemento principal: ele gira levemente, flutua ou recebe um brilho que percorre a superfície. Textos e logotipo ficam parados.',
};

export async function POST(request: Request) {
  const user = await authorize(request);
  if (user instanceof Response) return user;
  { const denied = forbid(user, 'edit'); if (denied) return denied; }
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  if (!apiKey()) return Response.json({ error: 'Configure a chave OpenAI no servidor para criar o motion.' }, { status: 503 });
  let reserved = false;
  let requestId = '';
  try {
    const data = (await request.json()) as Record<string, unknown>;
    requestId = typeof data.requestId === 'string' ? data.requestId : '';
    if (!/^[a-f0-9-]{36}$/.test(requestId)) throw new Error('Pedido inválido.');
    const state = activeState(await readState(request));
    const item = state.contents.find((c) => c.id === data.contentId);
    if (!item) throw new Error('Pauta não encontrada.');
    if (PROTECTED.includes(item.status))
      throw new Error('Esta peça está em aprovação ou já foi aprovada. Peça alteração antes de criar o motion.');
    const version = state.versions.filter((v) => v.contentId === item.id).sort((a, b) => b.number - a.number)[0];
    // Source art: the Feed art, or the first still image of the files.
    const candidates = [version?.feedUrl || '', ...(version?.media || []).map((m) => m.url)];
    const source = candidates
      .map((url) => /^\/api\/assets\/([A-Za-z0-9-]+)$/.exec(url)?.[1])
      .map((id) => state.assets.find((a) => a.id === id && a.brandId === item.brandId && STILL.includes(a.mime)))
      .find(Boolean);
    if (!source) throw new Error('Crie ou envie a arte estática antes de animar.');

    const frames = FRAMES[String(data.length)] || FRAMES.medio;
    const frameMs = SPEED[String(data.speed)] || SPEED.normal;
    const style = STYLE[String(data.style)] || STYLE.sutil;
    const direction = typeof data.prompt === 'string' ? data.prompt.trim().slice(0, 600) : '';

    // One paid image request at a time per workspace (same guard as the art).
    const reservation = await database()
      .prepare(
        "INSERT INTO image_requests (id,contentId,status,assetId,createdAt) SELECT ?,?,'pending','',? WHERE NOT EXISTS (SELECT 1 FROM image_requests WHERE status='pending' AND createdAt>?)",
      )
      .bind(requestId, item.id, new Date().toISOString(), new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .run();
    if (!reservation.meta.changes) throw new Error('Há uma imagem em geração. Aguarde a conclusão antes de iniciar outra.');
    reserved = true;

    const object = await bucket().get('brands/' + source.brandId + '/' + source.id);
    if (!object) throw new Error('A arte desta peça não está disponível.');
    const texts = [version?.headline, version?.copy].filter((t) => t && t.trim()).map((t) => JSON.stringify(t!.slice(0, 200)));
    const prompt =
      'Anime a ARTE ANEXADA como um motion curto de redes sociais, em loop contínuo e sem corte visível entre o último e o primeiro quadro. ' +
      'A arte anexada é a peça final aprovada pela agência: mantenha a mesma composição, enquadramento, paleta, tipografia, fotos e logotipo. Não recrie a peça, não troque o fundo, não mude o layout. ' +
      (texts.length
        ? 'Os textos da arte (' + texts.join(' / ') + ') devem continuar exatamente com a mesma grafia, legíveis e sem distorção; não acrescente nenhum texto novo. '
        : 'Não acrescente nenhum texto novo. ') +
      'O logotipo nunca deforma, pisca ou muda de cor. Câmera fixa. ' +
      style +
      (direction ? ' Direção pedida pela equipe: ' + JSON.stringify(direction) + '.' : '');

    const form = new FormData();
    form.append('model', MOTION_MODEL);
    form.append('n', '1');
    form.append('size', '768x960');
    form.append('quality', 'high');
    form.append('output_format', 'gif');
    form.append('frame_count', String(frames));
    form.append('frame_duration_ms', String(frameMs));
    form.append('prompt', prompt);
    form.append('image[]', new File([await object.arrayBuffer()], source.name, { type: source.mime }));
    const result = await openaiRequest(apiKey(), 'images/edits', form);
    const encoded = (result.data as { b64_json?: string }[] | undefined)?.[0]?.b64_json;
    if (!encoded || encoded.length > 40 * 1024 * 1024) throw new OpenAIError('A OpenAI devolveu um motion vazio ou muito grande.');
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const file = new File([bytes], 'motion.gif', { type: 'image/gif' });
    await validateUpload(file);
    const asset = assetRecord(file, item.brandId, {
      name: (item.title + ' · motion · IA').slice(0, 200),
      category: 'delivery',
      description: 'Motion em loop · ' + frames + ' quadros de ' + frameMs + ' ms',
      aiNotes: ('Motion gerado com OpenAI (' + MOTION_MODEL + ') a partir de ' + source.name + '. Revisão humana necessária.').slice(0, 6000),
    });
    await bucket().put('brands/' + item.brandId + '/' + asset.id, bytes, { httpMetadata: { contentType: 'image/gif' } });
    await insert('brand_assets', asset).run();
    await database()
      .prepare("UPDATE image_requests SET status='complete',assetId=? WHERE id=?")
      .bind(asset.id, requestId)
      .run();
    return Response.json({ ok: true, assetId: asset.id, url: asset.url, frames, frameMs, sourceUrl: source.url });
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
        : 'Não foi possível criar o motion. Tente de novo.';
    if (error instanceof OpenAIError) await apiAlert(request, 'OpenAI', message).catch(() => {});
    return Response.json({ error: message }, { status: 400 });
  }
}
