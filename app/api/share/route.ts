import { authorize, forbid } from '@/lib/auth';
import { assertBrandWorkspace } from '@/lib/workspaces';
import { database } from '@/lib/repository';
import { activeShare, ensureShareLinks, newShareToken } from '@/lib/share';

/** Team: the client link of a brand (see lib/share.ts). */
export async function GET(request: Request) {
  const user = await authorize(request);
  if (user instanceof Response) return user;
  { const denied = forbid(user, 'edit'); if (denied) return denied; }
  try {
    const brandId = new URL(request.url).searchParams.get('brandId') || '';
    await assertBrandWorkspace(request, brandId);
    const link = await activeShare(brandId);
    return Response.json(
      { link: link ? new URL(request.url).origin + '/#cliente?token=' + link.token : '', createdAt: link?.createdAt || '' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Erro.' }, { status: 400 });
  }
}
/** create (replaces the previous link) · revoke */
export async function POST(request: Request) {
  const user = await authorize(request);
  if (user instanceof Response) return user;
  { const denied = forbid(user, 'edit'); if (denied) return denied; }
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin)
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  try {
    const data = (await request.json()) as { action?: string; brandId?: string };
    const brandId = typeof data.brandId === 'string' ? data.brandId : '';
    const workspace = await assertBrandWorkspace(request, brandId);
    await ensureShareLinks();
    const db = database();
    const now = new Date().toISOString();
    const revoke = db.prepare('UPDATE share_links SET revokedAt=? WHERE brandId=? AND revokedAt IS NULL').bind(now, brandId);
    if (data.action === 'revoke') {
      await revoke.run();
      return Response.json({ ok: true, link: '' });
    }
    if (data.action !== 'create') throw new Error('Ação inválida.');
    const token = newShareToken();
    await db.batch([
      revoke,
      db.prepare('INSERT INTO share_links (token,brandId,workspaceId,createdBy,createdAt) VALUES (?,?,?,?,?)').bind(token, brandId, workspace.id, user.id, now),
    ]);
    return Response.json({ ok: true, link: new URL(request.url).origin + '/#cliente?token=' + token });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Erro.' }, { status: 400 });
  }
}
