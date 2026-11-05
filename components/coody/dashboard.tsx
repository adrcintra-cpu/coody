'use client';
import {
  ArrowRight,
  ArrowUpRight,
  Clock3,
  SlidersHorizontal,
} from 'lucide-react';
import { ContentRow, BrandMark, Meter, StatusBadge, NoData } from './shared';
import { columnOf, columns, heldByPlan, planApprovalOf } from '@/lib/domain';
import {
  displayDate,
  today,
  type State,
  type Content,
  type View,
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
  const brandOf = (id: string) => state.brands.find((b) => b.id === id);
  // Overdue: publication date already passed and the piece is not approved.
  const overdue = (c: Content) =>
    c.date < now && !['APROVADO', 'PUBLICADO'].includes(c.status) && !heldByPlan(c, state.plans);
  const byDate = (a: Content, b: Content) => a.date.localeCompare(b.date);
  // Same numbers as the Produção board: its columns, pieces held by a month
  // plan left out, and decisions pending from any month.
  const boardItems = state.contents.filter(
    (c) =>
      !heldByPlan(c, state.plans) &&
      (c.date.startsWith(month) || ['APROVAÇÃO', 'AJUSTE', 'ALTERAÇÃO'].includes(c.status)),
  );
  const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const waitingPlans = state.plans
    .filter((p) => planApprovalOf(p) !== 'aprovado' && p.month >= now.slice(0, 7))
    .map((p) => ({ plan: p, count: state.contents.filter((c) => heldByPlan(c, [p])).length }))
    .filter((w) => w.count);
  const groups: { title: string; hint: (c: Content) => string; items: Content[] }[] = [
    {
      title: 'O cliente pediu mudança',
      hint: (c) => (c.status === 'AJUSTE' ? 'Ajuste fino na mesma arte' : 'Uma nova imagem foi pedida'),
      items: state.contents.filter((c) => c.status === 'AJUSTE' || c.status === 'ALTERAÇÃO').sort(byDate),
    },
    {
      title: 'Atrasadas',
      hint: (c) => 'Data de publicação já passou (' + displayDate(c.date) + ')',
      items: state.contents.filter((c) => overdue(c) && !['AJUSTE', 'ALTERAÇÃO', 'APROVAÇÃO'].includes(c.status)).sort(byDate),
    },
    {
      title: 'Aguardando o cliente',
      hint: (c) => 'Enviada para aprovação · publica em ' + displayDate(c.date),
      items: state.contents.filter((c) => c.status === 'APROVAÇÃO').sort(byDate),
    },
    {
      title: 'Aprovadas para publicar',
      hint: (c) => 'Publicar até ' + displayDate(c.date),
      items: state.contents.filter((c) => c.status === 'APROVADO' && c.date <= soon).sort(byDate),
    },
  ].filter((g) => g.items.length);
  const attentionCount = groups.reduce((n, g) => n + g.items.length, 0) + waitingPlans.length;
  const upcoming = state.contents
    .filter((c) => c.status !== 'PUBLICADO' && c.date >= now)
    .sort(byDate)
    .slice(0, 4);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SEU WORKSPACE CRIATIVO</p>
          <h1>Visão geral</h1>
          <p>O que está em produção e o que precisa de você hoje.</p>
        </div>
        <button
          className="outline-btn"
          onClick={() => navigate('Produção')}
        >
          <SlidersHorizontal size={16} /> Abrir produção{' '}
          <ArrowUpRight size={15} />
        </button>
      </div>
      <section className="metrics">
        <div className="metric total">
          <span>Pautas do mês</span>
          <strong>
            {String(items.length).padStart(2, '0')}
            <small>
              {' '}
              / {state.brands.reduce((a, b) => a + b.monthlyGoal, 0)}
            </small>
          </strong>
          <span className="muted">meta somada das marcas</span>
        </div>
        {columns.map((col) => (
          <button
            className="metric"
            key={col.id}
            onClick={() => navigate('Produção')}
            title={col.hint}
          >
            <span>
              <i className={'dot dot-' + col.statuses[0].replaceAll(' ', '-')} />
              {col.title}
            </span>
            <strong>
              {String(boardItems.filter((c) => columnOf(c.status) === col.id).length).padStart(2, '0')}
            </strong>
            <span className="metric-link">
              Ver na produção <ArrowUpRight size={13} />
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
                <span className="count">{attentionCount}</span>
              </h2>
              <button
                onClick={() => navigate('Produção')}
                className="text-btn"
              >
                Abrir produção <ArrowRight size={16} />
              </button>
            </div>
            {waitingPlans.length > 0 && (
              <div className="attention-group">
                <h3>Planejamentos sem aprovação do cliente</h3>
                {waitingPlans.map(({ plan, count }) => (
                  <button className="attention-row" key={plan.id} onClick={() => navigate('Planejamento')}>
                    <BrandMark brand={brandOf(plan.brandId)} />
                    <span className="row-title">
                      <strong>
                        {brandOf(plan.brandId)?.name} ·{' '}
                        {new Date(plan.month + '-15T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                      </strong>
                      <small>
                        {count} pauta(s) ·{' '}
                        {planApprovalOf(plan) === 'rascunho'
                          ? 'ainda não enviado ao cliente'
                          : planApprovalOf(plan) === 'ajustes'
                            ? 'o cliente pediu mudanças'
                            : 'aguardando o cliente'}
                      </small>
                    </span>
                    <ArrowUpRight size={17} />
                  </button>
                ))}
              </div>
            )}
            {groups.map((g) => (
              <div className="attention-group" key={g.title}>
                <h3>
                  {g.title} <span className="muted">{g.items.length}</span>
                </h3>
                {g.items.slice(0, 4).map((c) => (
                  <button className="attention-row" key={c.id} onClick={() => open(c)}>
                    <BrandMark brand={brandOf(c.brandId)} />
                    <span className="row-title">
                      <strong>{c.title}</strong>
                      <small>
                        {brandOf(c.brandId)?.name} · {g.hint(c)}
                      </small>
                    </span>
                    <StatusBadge status={c.status} />
                    <ArrowUpRight size={17} />
                  </button>
                ))}
                {g.items.length > 4 && (
                  <button className="text-btn" onClick={() => navigate('Produção')}>
                    + {g.items.length - 4} na produção
                  </button>
                )}
              </div>
            ))}
            {!attentionCount && <p className="muted">Tudo em dia. Nada esperando por você.</p>}
          </section>
          <section className="recent section-space">
            <div className="section-head">
              <h2>Na mesa de criação</h2>
              <button
                className="text-btn"
                onClick={() => navigate('Conteúdos')}
              >
                Todas as pautas <ArrowRight size={16} />
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
          </section>
        </aside>
      </div>
    </>
  );
}
