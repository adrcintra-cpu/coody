'use client';
import {
  ArrowRight,
  ArrowUpRight,
  Clock3,
  SlidersHorizontal,
  CornerDownRight,
} from 'lucide-react';
import { ContentRow, BrandMark, Meter, StatusBadge, NoData } from './shared';
import {
  displayDate,
  today,
  statusLabels,
  type State,
  type Content,
  type View,
  type Status,
} from '@/lib/types';
export function Dashboard({
  state,
  month,
  open,
  navigate,
}: {
  state: State;
  month: string;
  open: (c: Content) => void;
  navigate: (v: View) => void;
}) {
  const items = state.contents.filter((c) => c.date.startsWith(month));
  const now = today();
  // Overdue: publication date already passed and the piece is not approved.
  const overdue = (c: Content) =>
    c.date < now && !['APROVADO', 'PUBLICADO'].includes(c.status);
  const attention = state.contents
    .filter(
      (c) =>
        c.status === 'ALTERAÇÃO' || c.status === 'APROVAÇÃO' || overdue(c),
    )
    .sort(
      (a, b) =>
        Number(overdue(b)) - Number(overdue(a)) || a.date.localeCompare(b.date),
    );
  const upcoming = state.contents
    .filter((c) => c.status !== 'PUBLICADO' && c.date >= now)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);
  const metrics: Status[] = [
    'EM CRIAÇÃO',
    'REVISÃO',
    'APROVAÇÃO',
    'ALTERAÇÃO',
    'APROVADO',
    'PUBLICADO',
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SEU WORKSPACE CRIATIVO</p>
          <h1>Visão geral</h1>
          <p>A clareza que sua produção precisa.</p>
        </div>
        <button
          className="outline-btn"
          onClick={() => navigate('Planejamento')}
        >
          <SlidersHorizontal size={16} /> Ver planejamento{' '}
          <ArrowUpRight size={15} />
        </button>
      </div>
      <section className="metrics">
        <div className="metric total">
          <span>Conteúdos do mês</span>
          <strong>
            {String(items.length).padStart(2, '0')}
            <small>
              {' '}
              / {state.brands.reduce((a, b) => a + b.monthlyGoal, 0)}
            </small>
          </strong>
          <span className="muted">planejados no período</span>
        </div>
        {metrics.map((s) => (
          <button
            className="metric"
            key={s}
            onClick={() =>
              navigate(
                s === 'APROVAÇÃO' || s === 'ALTERAÇÃO'
                  ? 'Aprovações'
                  : 'Conteúdos',
              )
            }
          >
            <span>
              <i className={'dot dot-' + s.replaceAll(' ', '-')} />
              {s === 'APROVAÇÃO' ? 'Em aprovação' : statusLabels[s]}
            </span>
            <strong>
              {String(items.filter((c) => c.status === s).length).padStart(
                2,
                '0',
              )}
            </strong>
            <span className="metric-link">
              Ver conteúdos <ArrowUpRight size={13} />
            </span>
          </button>
        ))}
      </section>
      <div className="dashboard-grid">
        <div>
          <section className="attention">
            <div className="section-head">
              <h2>
                <span className="attention-dot" />
                Precisa da sua atenção{' '}
                <span className="count">{attention.length}</span>
              </h2>
              <button
                onClick={() => navigate('Aprovações')}
                className="text-btn"
              >
                Ver tudo <ArrowRight size={16} />
              </button>
            </div>
            {attention.length ? (
              attention.slice(0, 3).map((c) => (
                <button
                  className="attention-row"
                  key={c.id}
                  onClick={() => open(c)}
                >
                  <BrandMark
                    brand={state.brands.find((b) => b.id === c.brandId)}
                  />
                  <span className="row-title">
                    <strong>{c.title}</strong>
                    <small>
                      {state.brands.find((b) => b.id === c.brandId)?.name} ·{' '}
                      {overdue(c)
                        ? 'Data de publicação já passou (' +
                          displayDate(c.date) +
                          ')'
                        : c.status === 'ALTERAÇÃO'
                          ? 'Uma nova direção para esta peça'
                          : 'Pronto para seu olhar final'}
                    </small>
                  </span>
                  <StatusBadge status={c.status} />
                  <ArrowUpRight size={17} />
                </button>
              ))
            ) : (
              <p className="muted">Tudo em dia. Sua equipe está no ritmo.</p>
            )}
          </section>
          <section className="recent section-space">
            <div className="section-head">
              <h2>Na mesa de criação</h2>
              <button
                className="text-btn"
                onClick={() => navigate('Conteúdos')}
              >
                Todos os conteúdos <ArrowRight size={16} />
              </button>
            </div>
            <div className="table-caption">
              <span>CONTEÚDO / MARCA</span>
              <span>STATUS</span>
              <span>PUBLICAÇÃO</span>
            </div>
            {items.length ? (
              items
                .slice(0, 6)
                .map((c) => (
                  <ContentRow
                    key={c.id}
                    item={c}
                    brand={state.brands.find((b) => b.id === c.brandId)}
                    onOpen={() => open(c)}
                  />
                ))
            ) : (
              <NoData />
            )}
          </section>
        </div>
        <aside className="dashboard-aside">
          <section>
            <div className="section-head">
              <h2>Próximas publicações</h2>
              <Clock3 size={17} />
            </div>
            <div className="timeline">
              {!upcoming.length && (
                <p className="muted">Nenhuma publicação agendada a partir de hoje.</p>
              )}
              {upcoming.map((c) => (
                <button
                  className="timeline-item"
                  onClick={() => open(c)}
                  key={c.id}
                >
                  <span className="timeline-date">{displayDate(c.date)}</span>
                  <strong>{c.title}</strong>
                  <small>
                    {state.brands.find((b) => b.id === c.brandId)?.name} ·{' '}
                    {c.format}
                  </small>
                </button>
              ))}
            </div>
            <button
              className="outline-btn full"
              onClick={() => navigate('Calendário')}
            >
              Abrir calendário <ArrowUpRight size={16} />
            </button>
          </section>
          <section className="section-space">
            <div className="section-head">
              <h2>Ritmo das marcas</h2>
              <span className="muted">mês</span>
            </div>
            {state.brands.map((b) => {
              const n = items.filter((c) => c.brandId === b.id).length;
              return (
                <button
                  className="brand-rhythm"
                  key={b.id}
                  onClick={() => navigate('Planejamento')}
                >
                  <div>
                    <BrandMark brand={b} />
                    <strong>{b.name}</strong>
                    <span>
                      {n}
                      <small> / {b.monthlyGoal}</small>
                    </span>
                  </div>
                  <Meter
                    value={(100 * n) / b.monthlyGoal}
                    label={'Produção ' + b.name}
                  />
                </button>
              );
            })}
            <p className="footnote">
              <CornerDownRight size={14} /> Cada ideia, um passo à frente.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
