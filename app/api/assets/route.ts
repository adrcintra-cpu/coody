import { activeWorkspace } from '@/lib/workspaces';
import { authorize } from '@/lib/auth';
import { bucket, database, ensureBrandLifecycle, insert } from '@/lib/repository';
import { validateUpload, assetRecord, limitedForm } from '@/lib/asset-upload';
export async function POST(request: Request) {
  const user = authorize(request);
  if (user instanceof Response) return user;
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  let key = '';
  let assetId = '';
  try {
    const form = await limitedForm(request, 21 * 1024 * 1024);
    const value = form.get('brandId');
    const brandId = typeof value === 'string' ? value : '';
    if (
      !brandId ||
      brandId === 'all' ||
      !(await ensureBrandLifecycle().then(() => true)) ||
      // Files go only to active brands (not inactive nor in the trash).
      !(await database()
        .prepare("SELECT id FROM brands WHERE id=? AND workspaceId=? AND deletedAt IS NULL AND status<>'inactive'")
        .bind(brandId,(await activeWorkspace(request)).id)
        .first())
    )
      throw new Error(
        'Selecione uma marca específica para adicionar o arquivo.',
      );
    const { file, bytes } = await validateUpload(form.get('file'));
    const asset = assetRecord(file, brandId, Object.fromEntries(form));
    assetId = asset.id;
    key = `brands/${brandId}/${asset.id}`;
    await bucket().put(key, bytes, {
      httpMetadata: { contentType: file.type },
    });
    await insert('brand_assets', asset).run();
    return Response.json({ ok: true, id: asset.id });
  } catch (e) {
    if (key) {
      const committed = await database()
        .prepare('SELECT id FROM brand_assets WHERE id=?')
        .bind(assetId)
        .first()
        .catch(() => true);
      if (!committed)
        await bucket()
          .delete(key)
          .catch(() => {});
    }
    return Response.json(
      { error: e instanceof Error ? e.message : 'Falha no upload.' },
      { status: 400 },
    );
  }
}
