import { bucket, database, insert } from '@/lib/repository';
const allowed = new Map([
  ['image/png', ['png']],
  ['image/jpeg', ['jpg', 'jpeg']],
  ['image/webp', ['webp']],
  ['image/svg+xml', ['svg']],
  ['application/pdf', ['pdf']],
]);
export async function POST(request: Request) {
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  let key = '';
  try {
    if (Number(request.headers.get('content-length')) > 21 * 1024 * 1024)
      throw new Error('Limite de 20 MB por arquivo.');
    const form = await request.formData();
    const file = form.get('file');
    const brandValue = form.get('brandId');
    const brandId = typeof brandValue === 'string' ? brandValue : '';
    const categoryValue = form.get('category');
    const category =
      typeof categoryValue === 'string' ? categoryValue : 'Outros';
    const brand = await database()
      .prepare('SELECT id FROM brands WHERE id=?')
      .bind(brandId)
      .first();
    if (!brand) throw new Error('Selecione uma marca.');
    if (!(file instanceof File) || file.size > 20 * 1024 * 1024 || !file.size)
      throw new Error('Envie um arquivo de até 20 MB.');
    if (
      !allowed
        .get(file.type)
        ?.includes(file.name.split('.').pop()?.toLowerCase() || '')
    )
      throw new Error('Use PDF, SVG, PNG, JPG ou WEBP.');
    const bytes = await file.arrayBuffer();
    const sig = new Uint8Array(bytes.slice(0, 12));
    const ascii = new TextDecoder().decode(sig);
    if (
      (file.type === 'application/pdf' && !ascii.startsWith('%PDF-')) ||
      (file.type === 'image/png' &&
        !(sig[0] === 137 && ascii.slice(1, 4) === 'PNG')) ||
      (file.type === 'image/jpeg' &&
        !(sig[0] === 255 && sig[1] === 216 && sig[2] === 255)) ||
      (file.type === 'image/webp' &&
        !(ascii.startsWith('RIFF') && ascii.slice(8) === 'WEBP'))
    )
      throw new Error('O conteúdo do arquivo não corresponde ao formato.');
    if (file.type === 'image/svg+xml') {
      const svg = new TextDecoder().decode(bytes);
      if (
        !/<svg[\s>]/i.test(svg) ||
        /<(?:script|foreignObject|iframe|object|embed|image|use|style|animate|set)\b|\bon\w+\s*=|(?:href|src)\s*=|url\s*\(|<!ENTITY/i.test(
          svg,
        )
      )
        throw new Error(
          'Este SVG contém recursos ativos. Exporte uma versão simples ou PNG.',
        );
    }
    const id = crypto.randomUUID();
    key = `brands/${brandId}/${id}`;
    await bucket().put(key, bytes, {
      httpMetadata: { contentType: file.type },
    });
    await insert('brand_assets', {
      id,
      brandId,
      name: file.name.slice(0, 200),
      category: category.slice(0, 100),
      mime: file.type,
      url: '/api/assets/' + id,
      priority: 0,
      approved: 0,
      createdAt: new Date().toISOString(),
    }).run();
    return Response.json({ ok: true, id });
  } catch (e) {
    if (key)
      await bucket()
        .delete(key)
        .catch(() => {});
    return Response.json(
      { error: e instanceof Error ? e.message : 'Falha no upload.' },
      { status: 400 },
    );
  }
}
