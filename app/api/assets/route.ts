import { activeWorkspace } from '@/lib/workspaces';
import { authorize, forbid } from '@/lib/auth';
import { bucket, database, ensureBrandLifecycle, insert } from '@/lib/repository';
import { validateUpload, assetRecord, limitedForm } from '@/lib/asset-upload';
export async function POST(request: Request) {
  const user = await authorize(request);
  if (user instanceof Response) return user;
  { const denied = forbid(user, 'edit'); if (denied) return denied; }
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

/**
 * Removes library files of the active workspace. A file used by any piece
 * (a version's art, including pieces in the trash) is kept and reported.
 * Records that only point to another file (e.g. "Arte aprovada" of a
 * product photo) are removed without touching the file. Removing a file
 * also removes its records, its 9:16 Story recomposition and its place in
 * the pieces' attachments.
 */
export async function DELETE(request: Request) {
  const user = await authorize(request);
  if (user instanceof Response) return user;
  { const denied = forbid(user, 'edit'); if (denied) return denied; }
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  try {
    const data = (await request.json()) as { ids?: unknown };
    const ids = Array.isArray(data.ids)
      ? [...new Set(data.ids.filter((x): x is string => typeof x === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(x)))]
      : [];
    if (!ids.length || ids.length > 100) throw new Error('Selecione de 1 a 100 arquivos.');
    const db = database();
    const workspace = await activeWorkspace(request);
    const removed: string[] = [];
    const kept: { name: string; reason: string }[] = [];
    const blobs: string[] = [];
    for (const id of ids) {
      const asset = await db
        .prepare('SELECT a.id,a.brandId,a.name,a.url FROM brand_assets a JOIN brands b ON b.id=a.brandId WHERE a.id=? AND b.workspaceId=?')
        .bind(id, workspace.id)
        .first<{ id: string; brandId: string; name: string; url: string }>();
      if (!asset) continue;
      const ownsFile = asset.url === '/api/assets/' + asset.id;
      if (!ownsFile) {
        await db.prepare('DELETE FROM brand_assets WHERE id=?').bind(asset.id).run();
        removed.push(asset.name);
        continue;
      }
      const used = (
        await db
          .prepare(
            'SELECT DISTINCT c.title, c.deletedAt FROM content_versions v JOIN content_items c ON c.id=v.contentId WHERE v.feedUrl=? OR v.storyUrl=? LIMIT 3',
          )
          .bind(asset.url, asset.url)
          .all<{ title: string; deletedAt: string | null }>()
      ).results;
      if (used.length) {
        kept.push({
          name: asset.name,
          reason:
            'usado na arte de ' +
            used.map((u) => '“' + u.title + '”' + (u.deletedAt ? ' (na lixeira)' : '')).join(', '),
        });
        continue;
      }
      const story = 'story-' + asset.id;
      const pieces = (
        await db
          .prepare("SELECT id,attachments FROM content_items WHERE brandId=? AND attachments LIKE ?")
          .bind(asset.brandId, '%' + asset.id + '%')
          .all<{ id: string; attachments: string }>()
      ).results;
      await db.batch([
        db.prepare('DELETE FROM brand_assets WHERE id=? OR id=? OR (brandId=? AND url=?)').bind(asset.id, story, asset.brandId, asset.url),
        ...pieces.map((p) => {
          let list: string[] = [];
          try {
            list = JSON.parse(p.attachments);
          } catch {}
          return db
            .prepare('UPDATE content_items SET attachments=? WHERE id=?')
            .bind(JSON.stringify((Array.isArray(list) ? list : []).filter((x) => x !== asset.id)), p.id);
        }),
      ]);
      blobs.push('brands/' + asset.brandId + '/' + asset.id, 'brands/' + asset.brandId + '/' + story);
      removed.push(asset.name);
    }
    for (const key of blobs) await bucket().delete(key).catch(() => {});
    return Response.json({ ok: true, removed, kept });
  } catch (e) {
    return Response.json({ error: e instanceof Error && !/SQLITE/.test(e.message) ? e.message : 'Não foi possível excluir.' }, { status: 400 });
  }
}
