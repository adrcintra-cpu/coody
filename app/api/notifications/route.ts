import { authorize } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { database, ensureBrandLifecycle } from '@/lib/repository';
import { activeWorkspace } from '@/lib/workspaces';

const decisionText: Record<string, string> = {
  APROVADO: 'aprovou a peça',
  AJUSTE: 'pediu um ajuste (mesma arte)',
  ALTERAÇÃO: 'pediu uma alteração (nova imagem)',
  APROVAÇÃO: 'enviou para aprovação',
};

/**
 * Notifications are decisions, in the order they happened: the client (or
 * another person) approved or asked for changes, a month plan was approved,
 * and, for administrators, integration alerts. Light queries only — the bell
 * polls every 30 s.
 */
export async function GET(request: Request) {
  const user = await authorize(request);
  if (user instanceof Response) return user;
  try {
    await ensureBrandLifecycle();
    const workspace = await activeWorkspace(request);
    const db = database();
    const [decisions, plans, alerts, reads] = await db.batch([
      db
        .prepare(
          `SELECT a.id,a.decision,a.createdAt,a.userId,c.id AS contentId,c.title,c.date,b.name AS brand,
             (SELECT name FROM users u WHERE u.id=a.userId) AS userName,
             (SELECT m.user FROM comments m WHERE m.contentId=a.contentId AND m.createdAt=a.createdAt LIMIT 1) AS commentUser
           FROM approvals a JOIN content_items c ON c.id=a.contentId JOIN brands b ON b.id=c.brandId
           WHERE b.workspaceId=? AND b.deletedAt IS NULL AND c.deletedAt IS NULL
             AND a.decision IN ('APROVADO','AJUSTE','ALTERAÇÃO') AND (a.userId IS NULL OR a.userId<>?)
           ORDER BY a.createdAt DESC LIMIT 30`,
        )
        .bind(workspace.id, user.id),
      db
        .prepare(
          `SELECT p.id,p.month,p.approvedAt,p.approvedBy,b.name AS brand FROM monthly_plans p JOIN brands b ON b.id=p.brandId
           WHERE b.workspaceId=? AND b.deletedAt IS NULL AND p.approval='aprovado' AND p.approvedAt IS NOT NULL
           ORDER BY p.approvedAt DESC LIMIT 10`,
        )
        .bind(workspace.id),
      db
        .prepare('SELECT * FROM api_alerts WHERE workspaceId=? ORDER BY createdAt DESC LIMIT 10')
        .bind(workspace.id),
      db.prepare('SELECT notificationId FROM notification_reads WHERE userId=?').bind(user.id),
    ]);
    const seen = new Set((reads.results as { notificationId: string }[]).map((r) => r.notificationId));
    type Row = Record<string, string | null>;
    const monthName = (m: string) =>
      new Date(m + '-15T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const items = [
      ...(decisions.results as Row[]).map((d) => {
        const who = d.userId ? d.userName || 'Equipe' : d.commentUser || 'O cliente';
        return {
          id: 'decision:' + d.id,
          title: d.title || 'Peça',
          message: `${d.brand} · ${who} ${decisionText[d.decision || ''] || d.decision}`,
          href: '#Studio?id=' + d.contentId + '&month=' + (d.date || '').slice(0, 7),
          createdAt: d.createdAt || '',
        };
      }),
      ...(plans.results as Row[]).map((p) => ({
        id: 'plan:' + p.id + ':' + p.approvedAt,
        title: 'Planejamento aprovado',
        message: `${p.brand} · ${monthName(p.month || '')} · ${p.approvedBy}`,
        href: '#Planejamento?month=' + p.month,
        createdAt: p.approvedAt || '',
      })),
      ...(can(user.role, 'manage')
        ? (alerts.results as Row[]).map((a) => ({
            id: a.id || '',
            title: 'Integração · ' + a.provider,
            message: a.message || '',
            href: '#Integrações',
            createdAt: a.createdAt || '',
          }))
        : []),
    ]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 40)
      .map((i) => ({ ...i, read: seen.has(i.id) }));
    return Response.json({ items }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Não foi possível carregar notificações.' }, { status: 503 });
  }
}
export async function POST(request: Request) {
  const user = await authorize(request);
  if (user instanceof Response) return user;
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin)
    return new Response(null, { status: 403 });
  try {
    const { ids } = (await request.json()) as { ids: string[] };
    if (!Array.isArray(ids) || ids.length > 50 || ids.some((id) => typeof id !== 'string' || id.length > 150))
      throw new Error();
    if (ids.length)
      await database().batch(
        ids.map((id) =>
          database()
            .prepare('INSERT OR IGNORE INTO notification_reads (id,userId,notificationId) VALUES (?,?,?)')
            .bind(user.id + ':' + id, user.id, id),
        ),
      );
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Não foi possível marcar como lida.' }, { status: 400 });
  }
}
