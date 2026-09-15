import { authorize } from '@/lib/auth';
import { database, bucket } from '@/lib/repository';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = authorize(request);
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/.test(id))
    return new Response('Não encontrado', { status: 404 });
  const url = '/api/avatars/' + id;
  const found = await database()
    .prepare(
      'SELECT id FROM brands WHERE avatarUrl=? UNION ALL SELECT id FROM users WHERE avatarUrl=? AND id=? UNION ALL SELECT id FROM workspaces WHERE avatarUrl=?',
    )
    .bind(url, url, user.id, url)
    .first();
  if (!found) return new Response('Não encontrado', { status: 404 });
  const object = await bucket().get('avatars/' + id);
  if (!object) return new Response('Não encontrado', { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType || 'image/png',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
