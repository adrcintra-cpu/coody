import { activeWorkspace } from '@/lib/workspaces';
import { authorize } from '@/lib/auth';
import { bucket, database } from '@/lib/repository';
import { validateUpload, limitedForm } from '@/lib/asset-upload';
import { storyAdaptationId } from '@/lib/domain';

/**
 * Stores the 1080 × 1920 Story adaptation rendered in the Studio from the
 * shared source art. The derived id is fixed by the source id, so each source
 * has exactly one Story and a Story can never be an unrelated image.
 */
export async function POST(request: Request) {
  const user = authorize(request);
  if (user instanceof Response) return user;
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  try {
    const form = await limitedForm(request, 6 * 1024 * 1024);
    const sourceUrl = String(form.get('sourceUrl') || '');
    const id = storyAdaptationId(sourceUrl);
    if (!id) throw new Error('Arte de origem inválida.');
    const source = await database()
      .prepare(
        'SELECT a.id,a.brandId,a.name,a.mime FROM brand_assets a JOIN brands b ON a.brandId=b.id WHERE a.url=? AND b.workspaceId=?',
      )
      .bind(sourceUrl, (await activeWorkspace(request)).id)
      .first<{ id: string; brandId: string; name: string; mime: string }>();
    if (!source || !source.mime.startsWith('image/'))
      throw new Error('A arte de origem não foi encontrada nesta marca.');
    const { file, bytes } = await validateUpload(form.get('file'));
    if (!['image/jpeg', 'image/png'].includes(file.type))
      throw new Error('A adaptação do Story deve ser JPG ou PNG.');
    const now = new Date().toISOString();
    await bucket().put(`brands/${source.brandId}/${id}`, bytes, {
      httpMetadata: { contentType: file.type },
    });
    await database()
      .prepare(
        `INSERT INTO brand_assets (id,brandId,name,category,mime,url,description,aiNotes,priority,approved,createdAt,updatedAt)
         VALUES (?,?,?,?,?,?,?,?,0,0,?,?)
         ON CONFLICT(id) DO UPDATE SET mime=excluded.mime, updatedAt=excluded.updatedAt`,
      )
      .bind(
        id,
        source.brandId,
        ('Story · ' + source.name).slice(0, 200),
        'material',
        file.type,
        '/api/assets/' + id,
        'Adaptação vertical 1080 × 1920 gerada automaticamente a partir de "' +
          source.name +
          '".',
        '',
        now,
        now,
      )
      .run();
    return Response.json({ ok: true, id, url: '/api/assets/' + id });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Falha ao salvar o Story.' },
      { status: 400 },
    );
  }
}
