import { authorize } from '@/lib/auth';
import { activeWorkspace } from '@/lib/workspaces';
import { database } from '@/lib/repository';
import {
  defaultSlackEvents,
  maskWebhook,
  parseEvents,
  validSlackWebhook,
} from '@/lib/slack';
import { postSlack, slackConnection, ensureSlackTable } from '@/lib/slack-send';

/** Slack connection of the active workspace (the webhook is never returned). */
export async function GET(request: Request) {
  const user = authorize(request);
  if (user instanceof Response) return user;
  try {
    const workspace = await activeWorkspace(request);
    const connection = await slackConnection(workspace.id);
    return Response.json(
      connection
        ? {
            connected: true,
            webhook: maskWebhook(connection.webhookUrl),
            events: connection.events,
          }
        : { connected: false, events: defaultSlackEvents },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { error: 'Não foi possível carregar a integração com o Slack.' },
      { status: 503 },
    );
  }
}

/** save {webhookUrl?, events} · test · disconnect */
export async function POST(request: Request) {
  const user = authorize(request);
  if (user instanceof Response) return user;
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  try {
    const data = (await request.json()) as {
      action?: string;
      webhookUrl?: string;
      events?: unknown;
    };
    const workspace = await activeWorkspace(request);
    await ensureSlackTable();
    const current = await slackConnection(workspace.id);
    if (data.action === 'disconnect') {
      await database()
        .prepare('DELETE FROM slack_connection WHERE workspaceId=?')
        .bind(workspace.id)
        .run();
      return Response.json({ ok: true, message: 'Slack desconectado.' });
    }
    if (data.action === 'test') {
      if (!current) throw new Error('Conecte o Slack primeiro.');
      await postSlack(current.webhookUrl, {
        text: `:wave: Teste do COODY: os avisos do workspace *${workspace.name}* chegam neste canal.`,
      });
      return Response.json({ ok: true, message: 'Mensagem de teste enviada ao Slack.' });
    }
    if (data.action !== 'save') throw new Error('Ação inválida.');
    const events = parseEvents(data.events);
    const typed = (data.webhookUrl || '').trim();
    const webhookUrl = typed ? validSlackWebhook(typed) : current?.webhookUrl || '';
    if (!webhookUrl)
      throw new Error(
        'Cole o endereço do webhook do Slack (começa com https://hooks.slack.com/services/).',
      );
    // A new webhook is confirmed with a message before it is saved.
    if (webhookUrl !== current?.webhookUrl)
      await postSlack(webhookUrl, {
        text: `:white_check_mark: COODY conectado. Os avisos do workspace *${workspace.name}* vão chegar neste canal.`,
      });
    await database()
      .prepare(
        'INSERT INTO slack_connection (workspaceId,webhookUrl,events,updatedAt) VALUES (?,?,?,?) ON CONFLICT(workspaceId) DO UPDATE SET webhookUrl=excluded.webhookUrl, events=excluded.events, updatedAt=excluded.updatedAt',
      )
      .bind(workspace.id, webhookUrl, JSON.stringify(events), new Date().toISOString())
      .run();
    return Response.json({
      ok: true,
      message:
        webhookUrl !== current?.webhookUrl
          ? 'Slack conectado. Enviamos uma mensagem de confirmação ao canal.'
          : 'Preferências de aviso salvas.',
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error && error.name !== 'TimeoutError'
            ? error.message
            : 'O Slack não respondeu. Tente novamente.',
      },
      { status: 400 },
    );
  }
}
