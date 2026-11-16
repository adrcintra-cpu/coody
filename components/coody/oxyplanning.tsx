'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarCheck2, ExternalLink, Link2, LoaderCircle, RefreshCw, Send } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HUB_URL } from '@/lib/oxyhub';
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

/**
 * Calendário do OxyCreate = calendário do OxyPlanning: mostra as publicações planejadas lá
 * (marcas ligadas), com o andamento da produção aqui quando a pauta está no OxyCreate.
 */
export function PlanningCalendar({
  state,
  month,
  openId,
  goPautas,
}: {
  state: State;
  month: string;
  openId: (id: string) => void;
  goPautas: () => void;
}) {
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches;
  const [view, setView] = useState(() => (narrow ? 'list' : 'month'));
  const [brand, setBrand] = useState('all');
  const [data, setData] = useState<Data | null>(null);
  const year = Number(month.slice(0, 4)),
    m = Number(month.slice(5));
  const n = new Date(year, m, 0).getDate();
  const first = month + '-01',
    last = month + '-' + String(n).padStart(2, '0');

  const load = useCallback(async () => {
    setData(null);
    try {
      const r = await fetch(`/api/oxyplanning?from=${first}&to=${last}`, { cache: 'no-store' });
      setData((await r.json()) as Data);
    } catch {
      setData({ state: 'erro', message: 'Não foi possível falar com o OxyPlanning. Verifique a conexão e tente de novo.' });
    }
  }, [first, last]);
  useEffect(() => {
    void load();
  }, [load]);

  const ok = data?.state === 'operacional' ? data : null;
  const items = (ok?.pautas || []).filter((p) => brand === 'all' || p.brandId === brand);
  const offset = (new Date(year, m - 1, 1).getDay() + 6) % 7;
  const cells = Array.from({ length: Math.ceil((n + offset) / 7) * 7 }, (_, i) => i - offset + 1);
  const contentOf = (id: string) => state.contents.find((c) => c.id === id);
  const linkedBrands = state.brands.filter((b) => ok?.links.some((l) => l.brandId === b.id));

  const chip = (p: Pauta) => {
    const b = state.brands.find((x) => x.id === p.brandId);
    const content = p.contentId ? contentOf(p.contentId) : undefined;
    return (
      <button
        className="calendar-content"
        key={p.postId}
        onClick={() => (content ? openId(content.id) : goPautas())}
        title={content ? 'Abrir no Studio' : 'Ver em Pautas'}
      >
        <small>
          {b?.name} · {p.formatLabel || formatLabel[p.format] || p.format}
        </small>
        <strong>{p.title || 'Sem título'}</strong>
        {content ? <StatusBadge status={content.status} /> : <span className="planning-chip">{planningLabel[p.planningStatus] || p.planningStatus}</span>}
      </button>
    );
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">OXYPLANNING</p>
          <h1>Calendário</h1>
          <p>As datas vêm do OxyPlanning. Para mudar uma data, altere lá.</p>
        </div>
        <a className="outline-btn" href={HUB_URL + '/abrir/aprovacao'} target="_blank" rel="noreferrer">
          <ExternalLink size={16} /> Abrir no OxyPlanning
        </a>
      </div>
      <div className="toolbar">
        <Picker
          label="Marca"
          value={brand}
          onChange={setBrand}
          options={[{ value: 'all', label: 'Todas as marcas' }, ...linkedBrands.map((b) => ({ value: b.id, label: b.name }))]}
        />
        <Tabs value={view} onValueChange={(v) => setView(String(v))}>
          <TabsList>
            <TabsTrigger value="month">Mês</TabsTrigger>
            <TabsTrigger value="list">Lista</TabsTrigger>
          </TabsList>
        </Tabs>
        {ok && <span className="muted">{items.length} publicações no mês · {items.filter((p) => p.contentId).length} em produção aqui</span>}
      </div>
      {!data ? (
        <section className="panel" aria-busy="true">
          <p className="muted">
            <LoaderCircle className="animate-spin" size={16} /> Buscando o calendário no OxyPlanning…
          </p>
        </section>
      ) : data.state !== 'operacional' ? (
        <section className="panel" role="status">
          <h2>{data.state === 'aguardando_integracao' ? 'Aguardando integração' : 'OxyPlanning indisponível'}</h2>
          <p className="muted">{data.message}</p>
          <button className="outline-btn" onClick={() => void load()}>
            <RefreshCw size={16} /> Tentar de novo
          </button>
        </section>
      ) : !data.links.length ? (
        <NoData title="Nenhuma marca ligada ao OxyPlanning" description="Ligue as marcas aos clientes em Pautas para ver o calendário." />
      ) : view === 'list' ? (
        items.length ? (
          <div className="planning-day">{items.map(chip)}</div>
        ) : (
          <NoData title="Sem publicações neste mês" description="Quando a cadência for planejada no OxyPlanning, as publicações aparecem aqui." />
        )
      ) : (
        <div className="calendar-scroll">
          <div className="calendar-grid">
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
              <div className="calendar-label" key={d}>
                {d}
              </div>
            ))}
            {cells.map((d, i) => {
              const valid = d > 0 && d <= n;
              const date = month + '-' + String(d).padStart(2, '0');
              return (
                <div className={'calendar-cell ' + (!valid ? 'outside' : '')} key={i}>
                  {valid && (
                    <>
                      <span className="calendar-day planning-calendar-day">
                        <span>{d}</span>
                      </span>
                      {items.filter((p) => p.date === date).map(chip)}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
