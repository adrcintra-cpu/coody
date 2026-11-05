'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
type Notice = {
  id: string;
  title: string;
  message: string;
  href: string;
  read: boolean;
  createdAt?: string;
};
const ago = (iso?: string) => {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return new Date(iso).toLocaleDateString('pt-BR');
};
/** onUpdate: called when a new decision arrives (the client acted), so the
 *  workspace reloads and the board is never stale. */
export function Notifications({ onUpdate }: { onUpdate?: () => void } = {}) {
  const [open, setOpen] = useState(false),
    [items, setItems] = useState<Notice[]>([]),
    [error, setError] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  const known = useRef<Set<string> | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const r = await fetch('/api/notifications', { cache: 'no-store', signal });
      if (!r.ok) throw new Error('Não foi possível carregar as notificações.');
      const data = (await r.json()) as { items: Notice[] };
      const fresh = data.items.some((i) => known.current && !known.current.has(i.id));
      known.current = new Set(data.items.map((i) => i.id));
      setItems(data.items);
      if (fresh) onUpdate?.();
      setError('');
    } catch (e) {
      if (!signal?.aborted)
        setError(e instanceof Error ? e.message : 'Falha ao carregar.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const timer = setInterval(() => {
      if (!document.hidden) void load(controller.signal);
    }, 30000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [load]);
  // Close on Esc, on a click outside and when the page changes.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    const onPointer = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) close();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('hashchange', close);
    window.addEventListener('popstate', close);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('hashchange', close);
      window.removeEventListener('popstate', close);
    };
  }, [open]);
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
    <div className="notification-wrap" ref={wrap}>
      <button
        className="notification-bell"
        aria-label={
          'Notificações' + (unread ? ', ' + unread + ' não lidas' : '')
        }
        aria-expanded={open}
        onClick={() => {
          if (!open) void load();
          setOpen(!open);
        }}
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
                {i.createdAt && <small className="muted">{ago(i.createdAt)}</small>}
              </a>
            ))}
          </div>
          <small>
            Decisões do cliente e da equipe, planejamentos aprovados e avisos das integrações.
          </small>
        </section>
      )}
    </div>
  );
}
