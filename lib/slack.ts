/**
 * Slack notices through an Incoming Webhook configured per workspace in
 * Integrações. Pure helpers (URL check, events, message) are tested in Node.
 */
/** Same wording as statusLabels in types.ts (kept local so Node can test it). */
const statusLabels: Record<string, string> = {
  APROVAÇÃO: 'Aguardando aprovação',
  ALTERAÇÃO: 'Em alteração',
  APROVADO: 'Aprovado',
  PUBLICADO: 'Publicado',
};

/** Events the workspace can turn on, with their labels in the UI. */
export const slackEvents = [
  ['APROVAÇÃO', 'Peça enviada para aprovação'],
  ['ALTERAÇÃO', 'Alteração solicitada'],
  ['APROVADO', 'Peça aprovada'],
  ['PUBLICADO', 'Peça publicada'],
  ['comment', 'Novo comentário'],
] as const;
export type SlackEvent = (typeof slackEvents)[number][0];
export const defaultSlackEvents: SlackEvent[] = ['APROVAÇÃO', 'ALTERAÇÃO', 'APROVADO'];

/** Only Slack Incoming Webhook addresses are accepted. */
export function validSlackWebhook(value: string) {
  const v = (value || '').trim();
  return /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]+$/.test(v)
    ? v
    : '';
}

/** Shows only the end of the webhook so the secret never returns to the page. */
export function maskWebhook(url: string) {
  return url ? 'https://hooks.slack.com/services/…' + url.slice(-4) : '';
}

export function parseEvents(value: unknown): SlackEvent[] {
  let list: unknown = value;
  if (typeof value === 'string') {
    try {
      list = JSON.parse(value);
    } catch {
      list = [];
    }
  }
  return Array.isArray(list)
    ? slackEvents.map(([e]) => e).filter((e) => list.includes(e))
    : [];
}

const icons: Record<string, string> = {
  APROVAÇÃO: ':eyes:',
  ALTERAÇÃO: ':pencil2:',
  APROVADO: ':white_check_mark:',
  PUBLICADO: ':rocket:',
  comment: ':speech_balloon:',
};
/** Slack mrkdwn escaping for user text. */
const esc = (s: string) =>
  (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Message for one event (Slack "text" with mrkdwn and a link to the Studio). */
export function slackMessage(input: {
  event: SlackEvent;
  title: string;
  brand: string;
  date: string;
  user: string;
  link: string;
  comment?: string;
}) {
  const what =
    input.event === 'comment'
      ? 'Novo comentário'
      : statusLabels[input.event] || input.event;
  const lines = [
    `${icons[input.event] || ''} *${what}* · ${esc(input.brand)}`.trim(),
    `<${input.link}|${esc(input.title).slice(0, 200)}> · publicação em ${input.date.split('-').reverse().join('/')}`,
    input.comment ? '> ' + esc(input.comment).slice(0, 500).replace(/\n/g, '\n> ') : '',
    `_por ${esc(input.user)} no COODY_`,
  ];
  return { text: lines.filter(Boolean).join('\n') };
}
