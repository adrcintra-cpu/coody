'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarCheck2, Link2, LoaderCircle, RefreshCw, Send } from 'lucide-react';
import { Picker, NoData, BrandMark, StatusBadge } from './shared';
import { can } from '@/lib/permissions';
import type { State } from '@/lib/types';

type Pauta = {
  postId: string;
  brandId: string;
  date: string;
  time: string | null;
  format: string;
  formatLabel: string | null;
  createFormat: string;
  planningStatus: string;
  title: string;
  theme: string;
  objective: string;
  campaign: string;
  extra: boolean;
  hasArt: boolean;
  contentId: string;
};
type Data =
  | { state: 'operacional'; syncError: string; clients: { id: string; name: string }[]; links: { brandId: string; clientId: string; clientName: string }[]; pautas: Pauta[] }
  | { state: 'aguardando_integracao' | 'erro'; message: string };

const planningLabel: Record<string, string> = {
  draft: 'Sem arte',
  awaiting: 'Com o cliente',
  changes_requested: 'Alteração pedida',
  approved: 'Aprovado pelo cliente',
  published: 'Publicado',
};
const formatLabel: Record<string, string> = { static: 'Post', carousel: 'Carrossel', video: 'Vídeo', reel: 'Reels', story: 'Story', other: 'Outro', website: 'Site', presentation: 'Apresentação' };
const dayLabel = (d: string) =>
  new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '');

/** Pautas do OxyPlanning: a cadência é feita lá; aqui a equipe escolhe o que produzir. */
export function OxyPlanningInbox({
  state,
  role,
  reload,
  openId,
}: {
  state: State;
  role?: string;
  reload: () => Promise<void> | void;
  openId: (id: string) => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await fetch('/api/oxyplanning', { cache: 'no-store' });
      setData((await r.json()) as Data);
    } catch {
      setData({ state: 'erro', message: 'Não foi possível falar com o OxyPlanning. Verifique a conexão e tente de novo.' });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    setError('');
    try {
      const r = await fetch('/api/oxyplanning', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const out = (await r.json()) as { error?: string; contentId?: string };
      if (!r.ok) throw new Error(out.error || 'Não foi possível concluir.');
      await Promise.all([load(), reload()]);
      return out;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir.');
    } finally {
      setBusy('');
    }
  };

  const brands = state.brands;
  const ok = data?.state === 'operacional' ? data : null;
  const pautas = useMemo(
    () => (ok ? ok.pautas.filter((p) => brandFilter === 'all' || p.brandId === brandFilter) : []),
    [ok, brandFilter],
  );
  const groups = useMemo(() => {
    const m = new Map<string, Pauta[]>();
    for (const p of pautas) m.set(p.date, [...(m.get(p.date) || []), p]);
    return [...m.entries()];
  }, [pautas]);
  const contentOf = (id: string) => state.contents.find((c) => c.id === id);
  const isAdmin = can(role, 'manage');

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">OXYPLANNING</p>
          <h1>Pautas</h1>
          <p>A cadência é definida no OxyPlanning. Escolha o que a equipe vai produzir aqui.</p>
        </div>
        <button className="outline-btn" onClick={() => void load()} disabled={!data}>
          <RefreshCw size={16} /> Atualizar
        </button>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {!data ? (
        <section className="panel" aria-busy="true">
          <p className="muted">
            <LoaderCircle className="animate-spin" size={16} /> Buscando pautas no OxyPlanning…
          </p>
        </section>
      ) : data.state !== 'operacional' ? (
        <section className="panel" role="status">
          <h2>{data.state === 'aguardando_integracao' ? 'Aguardando integração' : 'OxyPlanning indisponível'}</h2>
          <p className="muted">{data.message}</p>
        </section>
      ) : (
        <>
          {ok?.syncError && (
            <p className="muted" role="status">
              Não consegui atualizar os status agora ({ok.syncError}). As pautas abaixo continuam valendo.
            </p>
          )}

          <section className="panel planning-links">
            <h2>
              <Link2 size={17} /> Marcas ligadas ao OxyPlanning
            </h2>
            <p className="muted">Cada marca do OxyCreate corresponde a um cliente do OxyPlanning. Só as marcas ligadas recebem pautas.</p>
            <div className="planning-links-grid">
              {brands.map((b) => {
                const link = ok!.links.find((l) => l.brandId === b.id);
                return (
                  <div className="planning-link-row" key={b.id}>
                    <span className="planning-link-brand">
                      <BrandMark brand={b} /> {b.name}
                    </span>
                    {isAdmin ? (
                      <Picker
                        label={'Cliente de ' + b.name}
                        value={link?.clientId || 'none'}
                        onChange={(v) =>
                          void post(v === 'none' ? { action: 'unlink', brandId: b.id } : { action: 'link', brandId: b.id, clientId: v }, 'link-' + b.id)
                        }
                        options={[{ value: 'none', label: 'Não ligada' }, ...ok!.clients.map((c) => ({ value: c.id, label: c.name }))]}
                      />
                    ) : (
                      <span className="muted">{link ? link.clientName : 'Não ligada'}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <div className="toolbar">
            <Picker
              label="Marca"
              value={brandFilter}
              onChange={setBrandFilter}
              options={[{ value: 'all', label: 'Todas as marcas' }, ...brands.filter((b) => ok!.links.some((l) => l.brandId === b.id)).map((b) => ({ value: b.id, label: b.name }))]}
            />
            <span className="muted">
              {pautas.length} pautas a partir de hoje · {pautas.filter((p) => p.contentId).length} em produção aqui
            </span>
          </div>

          {!ok!.links.length ? (
            <NoData title="Nenhuma marca ligada" description={isAdmin ? 'Ligue uma marca a um cliente do OxyPlanning acima para ver as pautas.' : 'Peça a um administrador para ligar as marcas aos clientes do OxyPlanning.'} />
          ) : !groups.length ? (
            <NoData title="Sem pautas a partir de hoje" description="Quando a cadência for planejada no OxyPlanning, as publicações aparecem aqui." />
          ) : (
            groups.map(([date, list]) => (
              <section className="planning-day" key={date}>
                <h3>{dayLabel(date)}</h3>
                {list.map((p) => {
                  const brand = brands.find((b) => b.id === p.brandId);
                  const content = p.contentId ? contentOf(p.contentId) : undefined;
                  return (
                    <article className="panel planning-pauta" key={p.postId}>
                      <BrandMark brand={brand} />
                      <div className="planning-pauta-body">
                        <strong>{p.title || 'Sem título'}</strong>
                        <span className="muted">
                          {brand?.name} · {p.formatLabel || formatLabel[p.format] || p.format}
                          {p.time ? ' · ' + p.time.slice(0, 5) : ''}
                          {p.campaign ? ' · ' + p.campaign : ''}
                          {p.extra ? ' · Extra' : ''}
                        </span>
                      </div>
                      <span className="planning-chip">{planningLabel[p.planningStatus] || p.planningStatus}</span>
                      {content ? (
                        <>
                          <StatusBadge status={content.status} />
                          <button className="outline-btn" onClick={() => openId(content.id)}>
                            Abrir <ArrowRight size={16} />
                          </button>
                        </>
                      ) : p.planningStatus !== 'draft' ? (
                        <span className="muted planning-direct">
                          <Send size={14} /> Arte enviada no OxyPlanning
                        </span>
                      ) : (
                        <button
                          className="create-btn"
                          disabled={!!busy}
                          onClick={async () => {
                            const out = await post({ action: 'produce', postId: p.postId }, p.postId);
                            if (out?.contentId) openId(out.contentId);
                          }}
                        >
                          {busy === p.postId ? <LoaderCircle className="animate-spin" size={16} /> : <CalendarCheck2 size={16} />} Produzir no OxyCreate
                        </button>
                      )}
                    </article>
                  );
                })}
              </section>
            ))
          )}
        </>
      )}
    </>
  );
}
