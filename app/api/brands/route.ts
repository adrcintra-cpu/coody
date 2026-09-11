import { bucket, database, insert, saveGuidelines } from '@/lib/repository';
import { parseBrand, guidelineRules } from '@/lib/brand-validation';
import { assetRecord, validateUpload, limitedForm } from '@/lib/asset-upload';
import type { Asset } from '@/lib/types';
export async function POST(request: Request) {
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  const staged: Asset[] = [];
  let brandId = '';
  try {
    const form = await limitedForm(request, 26 * 1024 * 1024);
    const payload = form.get('payload');
    if (typeof payload !== 'string') throw new Error('Cadastro inválido.');
    const input = JSON.parse(payload) as {
      id: string;
      brand: Record<string, unknown>;
      assets: Record<string, unknown>[];
    };
    if (
      !/^[0-9a-f-]{36}$/i.test(input.id) ||
      !input.brand ||
      !Array.isArray(input.assets) ||
      input.assets.length > 12
    )
      throw new Error('Cadastro inválido.');
    brandId = input.id;
    const brand = parseBrand(input.brand, brandId);
    if (
      await database()
        .prepare('SELECT id FROM brands WHERE id=?')
        .bind(brandId)
        .first()
    )
      return Response.json({ ok: true, id: brandId });
    const files = form.getAll('files');
    if (files.length !== input.assets.length)
      throw new Error('Revise os arquivos do cadastro.');
    if (
      files.some((f) => !(f instanceof File)) ||
      files.reduce((s, f) => s + (f instanceof File ? f.size : 0), 0) >
        25 * 1024 * 1024
    )
      throw new Error('Use até 25 MB de arquivos por cadastro.');
    // Validate all metadata first. Files stay outside D1 and are compensated on failure.
    for (let i = 0; i < files.length; i++)
      assetRecord(files[i] as File, brandId, input.assets[i]);
    for (let i = 0; i < files.length; i++) {
      const { file, bytes } = await validateUpload(files[i]);
      const asset = assetRecord(file, brandId, input.assets[i]);
      staged.push(asset);
      await bucket().put(`brands/${brandId}/${asset.id}`, bytes, {
        httpMetadata: { contentType: file.type },
      });
    }
    const now = new Date().toISOString();
    await database().batch([
      insert('brands', brand),
      ...staged.map((a) => insert('brand_assets', a)),
      ...saveGuidelines(brandId, guidelineRules(brand), now),
    ]);
    return Response.json({ ok: true, id: brandId });
  } catch (e) {
    for (const asset of staged) {
      const committed = await database()
        .prepare('SELECT id FROM brand_assets WHERE id=?')
        .bind(asset.id)
        .first()
        .catch(() => true);
      if (!committed)
        await bucket()
          .delete(`brands/${asset.brandId}/${asset.id}`)
          .catch(() => {});
    }
    if (
      brandId &&
      (await database()
        .prepare('SELECT id FROM brands WHERE id=?')
        .bind(brandId)
        .first()
        .catch(() => null))
    )
      return Response.json({ ok: true, id: brandId });
    return Response.json(
      {
        error:
          e instanceof Error
            ? e.message
            : 'Não foi possível concluir o cadastro.',
      },
      { status: 400 },
    );
  }
}
