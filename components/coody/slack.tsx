'use client';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { slackEvents, type SlackEvent } from '@/lib/slack';

type Model = { connected: boolean; webhook?: string; events: SlackEvent[] };

/** Integrações › Slack: webhook of the channel and which notices to send. */
export function SlackIntegration() {
  const [model, setModel] = useState<Model | null>(null);
  const [webhook, setWebhook] = useState('');
  const [events, setEvents] = useState<SlackEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function load() {
    const r = await fetch('/api/slack', { cache: 'no-store' });
    const data = (await r.json()) as Model & { error?: string };
    if (!r.ok) throw new Error(data.error);
    setModel(data);
    setEvents(data.events);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function action(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const r = await fetch('/api/slack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await r.json()) as { error?: string; message?: string };
      if (!r.ok) throw new Error(result.error);
      setMessage(result.message || 'Salvo.');
      setWebhook('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>Slack</h2>
      <p className="form-hint">
        Avisos do fluxo de aprovação num canal do Slack, com link direto para a
        peça no Studio.
      </p>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {message && <output className="notice">{message}</output>}
      {model && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void action({ action: 'save', webhookUrl: webhook, events });
          }}
        >
          <p className="stage-label">
            {model.connected
              ? 'Conectado · ' + model.webhook
              : 'Não conectado'}
          </p>
          <label className="field" htmlFor="slack-webhook">
            <span>
              {model.connected
                ? 'Trocar webhook (opcional)'
                : 'Webhook do canal (Incoming Webhook)'}
            </span>
            <Input
              id="slack-webhook"
              type="password"
              autoComplete="off"
              placeholder="https://hooks.slack.com/services/…"
              value={webhook}
              disabled={busy}
              onChange={(e) => setWebhook(e.target.value)}
            />
          </label>
          <fieldset className="slack-events" disabled={busy}>
            <legend>Avisar quando</legend>
            {slackEvents.map(([value, label]) => (
              <label key={value} className="check-label">
                <input
                  type="checkbox"
                  checked={events.includes(value)}
                  onChange={(e) =>
                    setEvents((old) =>
                      e.target.checked
                        ? [...old, value]
                        : old.filter((x) => x !== value),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="form-actions">
            {model.connected && (
              <>
                <button
                  type="button"
                  className="text-btn"
                  disabled={busy}
                  onClick={() => action({ action: 'disconnect' })}
                >
                  Desconectar
                </button>
                <button
                  type="button"
                  className="outline-btn"
                  disabled={busy}
                  onClick={() => action({ action: 'test' })}
                >
                  Enviar teste
                </button>
              </>
            )}
            <button
              className="create-btn"
              disabled={busy || (!model.connected && !webhook.trim())}
            >
              {busy
                ? 'Salvando…'
                : model.connected
                  ? 'Salvar avisos'
                  : 'Conectar Slack'}
            </button>
          </div>
          {!model.connected && (
            <details className="form-hint">
              <summary>Como obter o webhook</summary>
              <ol>
                <li>
                  Em api.slack.com/apps, crie um app (“From scratch”) no
                  workspace do Slack.
                </li>
                <li>
                  Em “Incoming Webhooks”, ative e clique em “Add New Webhook to
                  Workspace”.
                </li>
                <li>Escolha o canal dos avisos e autorize.</li>
                <li>Copie o endereço gerado e cole acima.</li>
              </ol>
            </details>
          )}
        </form>
      )}
    </section>
  );
}
