import { env } from 'cloudflare:workers';
import { authorize } from '@/lib/auth';
import { database, bucket, insert, readState } from '@/lib/repository';
import { assetRecord, validateUpload } from '@/lib/asset-upload';
const model = 'gpt-image-2';
function apiKey() {
  return (env as unknown as Record<string, string>).OPENAI_API_KEY || '';
}
function failure(status: number) {
  if (status === 401)
    return 'Chave OpenAI inválida. Atualize a chave no servidor.';
  if (status === 403)
    return 'Este projeto OpenAI não tem acesso ao modelo de imagens. Verifique as permissões e a verificação da organização.';
  if (status === 429)
    return 'A OpenAI recusou o pedido por limite ou saldo. Verifique o faturamento da API antes de tentar novamente.';
  if (status === 400)
    return 'A OpenAI recusou esta descrição ou configuração. Revise a descrição da imagem.';
  return 'A OpenAI não concluiu o pedido. Consulte a biblioteca antes de tentar novamente.';
}
export async function GET(request: Request) {
  const user = authorize(request);
  if (user instanceof Response) return user;
  if (!apiKey())
    return Response.json({
      configured: false,
      message: 'Chave OpenAI não configurada.',
    });
  try {
    const response = await fetch('https://api.openai.com/v1/models/' + model, {
      headers: { Authorization: 'Bearer ' + apiKey() },
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
    return Response.json({
      configured: true,
      connected: response.ok,
      model,
      message: response.ok
        ? 'Conexão verificada. Gere imagens no Studio. A geração depende de saldo e acesso ao modelo.'
        : failure(response.status),
    });
  } catch {
    return Response.json({
      configured: true,
      connected: false,
      message: 'Não foi possível verificar a conexão com a OpenAI.',
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
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  if (!apiKey())
    return Response.json(
      { error: 'Configure a chave OpenAI no servidor.' },
      { status: 503 },
    );
  let reserved = false;
  let id = '';
  try {
    if (Number(request.headers.get('content-length')) > 12000)
      throw new Error('Descrição muito longa.');
    const body = await request.text();
    if (body.length > 12000) throw new Error('Descrição muito longa.');
    const data = JSON.parse(body);
    id = typeof data.id === 'string' ? data.id : '';
    if (
      !/^[a-f0-9-]{36}$/.test(id) ||
      !['feed', 'story'].includes(data.format) ||
      typeof data.prompt !== 'string' ||
      !data.prompt.trim() ||
      data.prompt.length > 3000
    )
      throw new Error(
        'Informe uma descrição de até 3.000 caracteres e um formato válido.',
      );
    const state = await readState();
    const item = state.contents.find((c) => c.id === data.contentId);
    if (!item) throw new Error('Pauta não encontrada.');
    const previous = await database()
      .prepare('SELECT * FROM image_requests WHERE id=?')
      .bind(id)
      .first<{ contentId: string; status: string; assetId: string }>();
    if (previous) {
      if (previous.contentId !== item.id) throw new Error('Pedido inválido.');
      if (previous.status === 'complete')
        return Response.json({
          ok: true,
          url: '/api/assets/' + previous.assetId,
        });
      throw new Error(
        'Este pedido já foi recebido. Confira a biblioteca; ele não será cobrado novamente por esta tentativa.',
      );
    }
    if (['APROVAÇÃO', 'APROVADO', 'PUBLICADO'].includes(item.status))
      throw new Error(
        'Esta pauta está protegida. Solicite alteração antes de gerar uma nova arte.',
      );
    const brand = state.brands.find((b) => b.id === item.brandId)!;
    // Atomic workspace reservation prevents simultaneous paid requests across tabs.
    const reservation = await database()
      .prepare(
        "INSERT INTO image_requests (id,contentId,status,assetId,createdAt) SELECT ?,?,'pending','',? WHERE NOT EXISTS (SELECT 1 FROM image_requests WHERE status='pending' AND createdAt>?)",
      )
      .bind(
        id,
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
    const context = {
      marca: brand.name,
      segmento: brand.segment,
      cores: brand.colors,
      fontes: brand.fonts,
      direcao: brand.direction,
      regras: brand.rules,
      evitar: brand.forbidden,
      observacoes: brand.creationNotes,
      pauta: item.title,
      briefing: item.brief,
    };
    const response = await fetch(
      'https://api.openai.com/v1/images/generations',
      {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(180000),
        headers: {
          Authorization: 'Bearer ' + apiKey(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          n: 1,
          quality: 'low',
          output_format: 'png',
          size: data.format === 'feed' ? '1024x1280' : '1152x2048',
          prompt:
            'Crie uma imagem para redes sociais respeitando o contexto textual da marca. Não invente logotipos. Arquivos de referência não foram fornecidos. Contexto: ' +
            JSON.stringify(context).slice(0, 18000) +
            '\nDescrição solicitada: ' +
            data.prompt,
        }),
      },
    );
    if (!response.ok) throw new Error(failure(response.status));
    const result = (await response.json()) as {
      data?: { b64_json?: string }[];
    };
    const encoded = result.data?.[0]?.b64_json;
    if (!encoded || encoded.length > 28 * 1024 * 1024)
      throw new Error('A OpenAI devolveu uma imagem vazia ou muito grande.');
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const file = new File([bytes], 'imagem-openai.png', { type: 'image/png' });
    await validateUpload(file);
    const asset = assetRecord(file, item.brandId, {
      name: (item.title + ' · ' + data.format + ' · IA').slice(0, 200),
      category: 'visual_reference',
      description: data.prompt,
      aiNotes: 'Gerada com OpenAI ' + model + '. Revisão humana necessária.',
    });
    await bucket().put('brands/' + item.brandId + '/' + asset.id, bytes, {
      httpMetadata: { contentType: 'image/png' },
    });
    await database().batch([
      insert('brand_assets', asset),
      database()
        .prepare(
          "UPDATE image_requests SET status='complete',assetId=? WHERE id=?",
        )
        .bind(asset.id, id),
    ]);
    return Response.json({ ok: true, url: asset.url });
  } catch (error) {
    if (reserved)
      await database()
        .prepare(
          "UPDATE image_requests SET status='failed' WHERE id=? AND status='pending'",
        )
        .bind(id)
        .run()
        .catch(() => {});
    const message =
      error instanceof Error &&
      error.name !== 'TimeoutError' &&
      error.name !== 'TypeError' &&
      error.name !== 'SyntaxError'
        ? error.message
        : 'Não foi possível concluir a geração. Confira a biblioteca antes de iniciar outro pedido.';
    return Response.json({ error: message }, { status: 400 });
  }
}
