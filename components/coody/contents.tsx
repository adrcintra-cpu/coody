'use client';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContentRow, Picker, NoData, StatusBadge } from './shared';
import {
  statuses,
  statusLabels,
  type State,
  type Content,
  type Status,
} from '@/lib/types';
export function Contents({
  state,
  month,
  open,
  create,
  approvals = false,
  fixedBrandId,
}: {
  fixedBrandId?: string;
  state: State;
  month: string;
  open: (c: Content) => void;
  create: (date?: string, brandId?: string) => void;
  approvals?: boolean;
}) {
  const [brand, setBrand] = useState(fixedBrandId || 'all');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  const items = state.contents.filter(
    (c) =>
      c.date.startsWith(month) &&
      (brand === 'all' || c.brandId === brand) &&
      (status === 'all' || c.status === status) &&
      (!approvals ||
        ['APROVAÇÃO', 'ALTERAÇÃO', 'APROVADO'].includes(c.status)) &&
      c.title.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {approvals ? 'O OLHAR QUE REFINA' : 'DA IDEIA À PUBLICAÇÃO'}
          </p>
          <h1>{approvals ? 'Aprovações' : 'Conteúdos'}</h1>
          <p>
            {approvals
              ? 'Feedback claro. Próximos passos definidos.'
              : 'Toda a produção, no mesmo espaço.'}
          </p>
        </div>
        {!approvals && (
          <button
            className="create-btn"
            onClick={() =>
              create(
                month + '-15',
                fixedBrandId || (brand === 'all' ? undefined : brand),
              )
            }
          >
            <Plus size={17} /> Criar conteúdo
          </button>
        )}
      </div>
      <div className="toolbar">
        {fixedBrandId ? (
          <span className="selected-brand-context">
            Marca:{' '}
            <strong>
              {state.brands.find((b) => b.id === fixedBrandId)?.name}
            </strong>
          </span>
        ) : (
          <Picker
            label="Marca"
            value={brand}
            onChange={setBrand}
            options={[
              { value: 'all', label: 'Todas as marcas' },
              ...state.brands.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
        )}
        <Picker
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'Todos os status' },
            ...(approvals
              ? (['APROVAÇÃO', 'ALTERAÇÃO', 'APROVADO'] as Status[])
              : statuses
            ).map((s) => ({ value: s, label: statusLabels[s] })),
          ]}
        />
        <Input
          placeholder="Buscar conteúdo…"
          aria-label="Buscar conteúdo"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="section-head">
        <span className="muted">
          {items.length} {items.length === 1 ? 'conteúdo' : 'conteúdos'}
        </span>
        {approvals && (
          <span className="form-hint">
            Aprovação interna · Trello ainda não conectado
          </span>
        )}
      </div>
      {items.length ? (
        items.map((c) => (
          <ContentRow
            key={c.id}
            item={c}
            brand={state.brands.find((b) => b.id === c.brandId)}
            onOpen={() => open(c)}
          />
        ))
      ) : (
        <NoData
          title="Nenhum conteúdo nesta seleção"
          description="Mude os filtros ou adicione uma nova pauta."
        />
      )}
    </>
  );
}
export function Calendar({
  state,
  month,
  open,
  create,
}: {
  state: State;
  month: string;
  open: (c: Content) => void;
  create: (date?: string, brandId?: string) => void;
}) {
  const [view, setView] = useState('month');
  const [brand, setBrand] = useState('all');
  const [week, setWeek] = useState('1');
  const items = state.contents.filter(
    (c) => c.date.startsWith(month) && (brand === 'all' || c.brandId === brand),
  );
  const year = Number(month.slice(0, 4)),
    m = Number(month.slice(5));
  const n = new Date(year, m, 0).getDate();
  const offset = (new Date(year, m - 1, 1).getDay() + 6) % 7;
  const cells = Array.from(
    { length: Math.ceil((n + offset) / 7) * 7 },
    (_, i) => i - offset + 1,
  );
  const visible =
    view === 'week'
      ? cells.slice((Number(week) - 1) * 7, Number(week) * 7)
      : cells;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">VISÃO EDITORIAL</p>
          <h1>Calendário</h1>
          <p>Encontre o equilíbrio entre frequência e intenção.</p>
        </div>
        <button
          className="create-btn"
          onClick={() =>
            create(month + '-15', brand === 'all' ? undefined : brand)
          }
        >
          <Plus size={17} /> Nova pauta
        </button>
      </div>
      <div className="toolbar">
        <Picker
          label="Marca"
          value={brand}
          onChange={setBrand}
          options={[
            { value: 'all', label: 'Todas as marcas' },
            ...state.brands.map((b) => ({ value: b.id, label: b.name })),
          ]}
        />
        <Tabs value={view} onValueChange={(v) => setView(String(v))}>
          <TabsList>
            <TabsTrigger value="month">Mês</TabsTrigger>
            <TabsTrigger value="week">Semana</TabsTrigger>
            <TabsTrigger value="list">Lista</TabsTrigger>
          </TabsList>
        </Tabs>
        {view === 'week' && (
          <Picker
            label="Semana"
            value={week}
            onChange={setWeek}
            options={Array.from({ length: cells.length / 7 }, (_, i) => ({
              value: String(i + 1),
              label: 'Semana ' + (i + 1),
            }))}
          />
        )}
      </div>
      {view === 'list' ? (
        items.length ? (
          items
            .sort((a, b) => a.date.localeCompare(b.date))
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
        )
      ) : (
        <div className="calendar-scroll">
          <div
            className={'calendar-grid ' + (view === 'week' ? 'week-view' : '')}
          >
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => (
              <div className="calendar-label" key={d}>
                {d}
              </div>
            ))}
            {visible.map((d, i) => {
              const valid = d > 0 && d <= n;
              const date = month + '-' + String(d).padStart(2, '0');
              return (
                <div
                  className={'calendar-cell ' + (!valid ? 'outside' : '')}
                  key={i}
                >
                  {valid && (
                    <>
                      <button
                        className="calendar-day"
                        aria-label={'Criar conteúdo em ' + date}
                        onClick={() =>
                          create(date, brand === 'all' ? undefined : brand)
                        }
                      >
                        <span>{d}</span>
                        <Plus size={13} />
                      </button>
                      {items
                        .filter((c) => c.date === date)
                        .map((c) => (
                          <button
                            className="calendar-content"
                            key={c.id}
                            onClick={() => open(c)}
                          >
                            <small>
                              {
                                state.brands.find((b) => b.id === c.brandId)
                                  ?.name
                              }
                            </small>
                            <strong>{c.title}</strong>
                            <StatusBadge status={c.status} />
                          </button>
                        ))}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div className="status-legend">
        {statuses.map((s) => (
          <StatusBadge key={s} status={s} />
        ))}
      </div>
    </>
  );
}
