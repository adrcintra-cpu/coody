import { avatarLimitMB } from '@/lib/upload-limits';
import { assertBrandWorkspace, activeWorkspace } from '@/lib/workspaces';
import { authorize, registerUser, forbid } from '@/lib/auth';
import { database, bucket } from '@/lib/repository';
import { limitedForm, validateUpload } from '@/lib/asset-upload';
export async function POST(request: Request) {
  const user = await authorize(request);
  if (user instanceof Response) return user;
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  let key = '';
  try {
    const form = await limitedForm(request, 6 * 1024 * 1024);
    const kind = form.get('kind');
    const brandValue = form.get('brandId');
    const brandId = typeof brandValue === 'string' ? brandValue : '';
    if (kind !== 'brand' && kind !== 'user' && kind !== 'workspace')
      throw new Error('Perfil inválido.');
    if (
      kind === 'brand' &&
      !(await database()
        .prepare('SELECT id FROM brands WHERE id=?')
        .bind(brandId)
        .first())
    )
      throw new Error('Marca não encontrada.');
    // Own photo: anyone. Brand photo: editors. Workspace photo: administrators.
    if (kind !== 'user') {
      const denied = forbid(user, kind === 'brand' ? 'edit' : 'manage');
      if (denied) return denied;
    }
    if(kind === 'brand') await assertBrandWorkspace(request,brandId);
    const workspace = kind === 'workspace' ? await activeWorkspace(request) : null;
    const input = form.get('file');
    if (
      !(input instanceof File) ||
      input.size > avatarLimitMB * 1024 * 1024 ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(input.type)
    )
      throw new Error(`Use PNG, JPG ou WEBP de até ${avatarLimitMB} MB.`);
    const { file, bytes } = await validateUpload(input);
    const id = crypto.randomUUID();
    key = 'avatars/' + id;
    await bucket().put(key, bytes, {
      httpMetadata: { contentType: file.type },
    });
    if (kind === 'user') await registerUser(user);
    const table = kind === 'brand' ? 'brands' : kind === 'workspace' ? 'workspaces' : 'users';
    await database()
      .prepare(`UPDATE ${table} SET avatarUrl=? WHERE id=?`)
      .bind('/api/avatars/' + id, kind === 'brand' ? brandId : workspace?.id || user.id)
      .run();
    return Response.json({ ok: true, url: '/api/avatars/' + id });
  } catch (error) {
    // Keep any uploaded object if a database response was uncertain; no destructive cleanup.
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Falha ao enviar foto.',
      },
      { status: 400 },
    );
  }
}
