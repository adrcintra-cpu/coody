import { authorize } from '@/lib/auth';
import { database } from '@/lib/repository';
export async function GET(request: Request) {
  const user = authorize(request);
  if (user instanceof Response) return user;
  const rows = await database()
    .prepare(
      'SELECT id,title,brandId,deletedAt FROM content_items WHERE deletedAt IS NOT NULL ORDER BY deletedAt DESC',
    )
    .all();
  return Response.json(
    { items: rows.results },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
export async function POST(request: Request) {
  const user = authorize(request);
  if (user instanceof Response) return user;
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  try {
    const { id } = (await request.json()) as { id: string };
    if (typeof id !== 'string') throw new Error('Conteúdo inválido.');
    await database()
      .prepare(
        'UPDATE content_items SET deletedAt=NULL,revision=revision+1 WHERE id=? AND deletedAt IS NOT NULL',
      )
      .bind(id)
      .run();
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: 'Não foi possível restaurar.' },
      { status: 400 },
    );
  }
}
