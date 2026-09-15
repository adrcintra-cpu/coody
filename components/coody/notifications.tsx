'use client';
import { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
type Notice = {
  id: string;
  title: string;
  message: string;
  href: string;
  read: boolean;
};
export function Notifications() {
  const [open, setOpen] = useState(false),
    [items, setItems] = useState<Notice[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const r = await fetch('/api/notifications', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!r.ok)
          throw new Error('Não foi possível carregar as notificações.');
        const data = (await r.json()) as { items: Notice[] };
        setItems(data.items);
        setError('');
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Falha ao carregar.');
      }
    }
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 30000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, []);
  async function read(ids: string[]) {
    try {
      const r = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!r.ok) throw new Error();
      setItems((old) =>
        old.map((i) => (ids.includes(i.id) ? { ...i, read: true } : i)),
      );
    } catch {
      setError('Não foi possível marcar como lida.');
    }
  }
  const unread = items.filter((i) => !i.read).length;
  return (
    <div className="notification-wrap">
      <button
        className="notification-bell"
        aria-label={
          'Notificações' + (unread ? ', ' + unread + ' não lidas' : '')
        }
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Bell size={21} />
        {unread > 0 && <span>{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <section className="notification-popover" aria-label="Notificações">
          <div className="notification-heading">
            <strong>Notificações</strong>
            <button
              aria-label="Fechar notificações"
              onClick={() => setOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          {unread > 0 && (
            <button
              className="text-btn"
              onClick={() =>
                void read(items.filter((i) => !i.read).map((i) => i.id))
              }
            >
              Marcar todas como lidas
            </button>
          )}
          {error && <p role="alert">{error}</p>}
          {!items.length && !error && <p>Nenhuma notificação por enquanto.</p>}
          <div className="notification-list">
            {items.map((i) => (
              <a
                key={i.id}
                href={i.href}
                className={i.read ? 'read' : ''}
                onClick={() => {
                  void read([i.id]);
                  setOpen(false);
                }}
              >
                <strong>{i.title}</strong>
                <span>{i.message}</span>
              </a>
            ))}
          </div>
          <small>
            Fases atuais e avisos recebidos das APIs. Atualização a cada 30
            segundos.
          </small>
        </section>
      )}
    </div>
  );
}
