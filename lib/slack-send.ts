import { database } from './repository';
import {
  defaultSlackEvents,
  parseEvents,
  slackMessage,
  type SlackEvent,
} from './slack';

/** The connection table is created on first use (no manual migration). */
let ready: Promise<unknown> | null = null;
export function ensureSlackTable() {
  ready ??= database()
    .prepare(
      'CREATE TABLE IF NOT EXISTS slack_connection (workspaceId TEXT PRIMARY KEY NOT NULL, webhookUrl TEXT NOT NULL, events TEXT NOT NULL, updatedAt TEXT NOT NULL)',
    )
    .run()
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}

export async function slackConnection(workspaceId: string) {
  await ensureSlackTable();
  const row = await database()
    .prepare('SELECT webhookUrl,events FROM slack_connection WHERE workspaceId=?')
    .bind(workspaceId)
    .first<{ webhookUrl: string; events: string }>();
  return row
    ? { webhookUrl: row.webhookUrl, events: parseEvents(row.events) }
    : null;
}

/** Posts to the webhook; true when Slack accepted the message. */
export async function postSlack(webhookUrl: string, body: { text: string }) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 120);
    throw new Error(
      response.status === 404 || /no_service|invalid_token/.test(detail)
        ? 'O Slack não reconheceu este webhook. Ele pode ter sido removido; gere um novo.'
        : `O Slack recusou a mensagem (${response.status}).`,
    );
  }
  return true;
}

/**
 * Best-effort notice after a change was saved: never fails the action that
 * triggered it.
 */
export async function notifySlack(
  workspaceId: string,
  event: SlackEvent,
  message: Parameters<typeof slackMessage>[0],
) {
  try {
    const connection = await slackConnection(workspaceId);
    if (!connection || !connection.events.includes(event)) return;
    await postSlack(connection.webhookUrl, slackMessage(message));
  } catch (error) {
    console.error('slack notice', error instanceof Error ? error.message : error);
  }
}
export { defaultSlackEvents };
