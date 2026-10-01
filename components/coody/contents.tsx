'use client';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContentRow, Picker, NoData, StatusBadge } from './shared';
import {
  statuses,
  statusLabels,
  type State,
  type Content,
  type Status,
  type Action,
} from '@/lib/types';
export function Contents({
  act,
  reload,
  state,
  month,
  open,
  create,
  approvals = false,
  fixedBrandId,
}: {
  act: Action;
  reload: () => Promise<void>;
  fixedBrandId?: string;
  state: State;
  month: string;
  open: (c: Content) => void;
  create: (date?: string, brandId?: string) => void;
  approvals?: boolean;
}) {
  const [removing, setRemoving] = useState<Content | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [trash, setTrash] = useState<
    { id: string; title: string; brandId: string }[] | null
  >(null);
  async function loadTrash() {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/trash');
      if (!r.ok) throw new Error('Não foi possível abrir a lixeira.');
      const d = (await r.json()) as {
        items: { id: string; title: string; brandId: string }[];
      };
      setTrash(d.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar.');
    } finally {
      setBusy(false);
    }
  }
  const [brand, setBrand] = useState(fixedBrandId || 'all');
  const [status, setStatus] = useState('all');
  const [query, setQuery] = useState('');
  // A search looks at every month (title, briefing and brand), so a piece is
  // found even when the workspace month is different.
  const normalize = (t: string) =>
    t.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const q = normalize(query.trim());
  const brandName = (id: string) =>
    state.brands.find((b) => b.id === id)?.name || '';
  const items = state.contents
    .filter(
      (c) =>
        (q ? true : c.date.startsWith(month)) &&
        (brand === 'all' || c.brandId === brand) &&
        (status === 'all' || c.status === status) &&
        (!approvals ||
          ['APROVAÇÃO', 'ALTERAÇÃO', 'APROVADO'].includes(c.status)) &&
        (!q ||
          normalize(c.title + ' ' + c.brief + ' ' + brandName(c.brandId)).includes(q)),
    )
    .sort((a, b) => (q ? b.date.localeCompare(a.date) : 0));
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
      <button
        className="outline-btn"
        disabled={busy}
        onClick={() => (trash === null ? void loadTrash() : setTrash(null))}
      >
        <Trash2 size={16} />
        {trash === null ? 'Lixeira' : 'Voltar aos conteúdos'}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {trash !== null && (
        <section className="panel">
          <h2>Lixeira de conteúdos</h2>
          <p>
            As versões e os arquivos são preservados. Restaurar devolve o
            conteúdo ao status anterior.
          </p>
          {trash
            .filter((c) => !fixedBrandId || c.brandId === fixedBrandId)
            .map((c) => (
              <div className="trash-row" key={c.id}>
                <span>{c.title}</span>
                <button
                  className="outline-btn"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError('');
                    try {
                      const r = await fetch('/api/trash', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: c.id }),
                      });
                      if (!r.ok) throw new Error('Falha ao restaurar.');
                      await reload();
                      await loadTrash();
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : 'Falha ao restaurar.',
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Restaurar
                </button>
              </div>
            ))}
          {!trash.filter((c) => !fixedBrandId || c.brandId === fixedBrandId)
            .length && <p>Lixeira vazia.</p>}
        </section>
      )}
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
          {q ? ' · buscando em todos os meses' : ''}
        </span>
        {approvals && (
          <span className="form-hint">
            Aprovação interna · Trello ainda não conectado
          </span>
        )}
      </div>
      {trash === null &&
        (items.length ? (
          items.map((c) => (
            <div className="content-manage-row" key={c.id}>
              <ContentRow
                item={c}
                brand={state.brands.find((b) => b.id === c.brandId)}
                onOpen={() => open(c)}
              />
              <button
                className="text-btn danger"
                aria-label={'Excluir ' + c.title}
                onClick={() => setRemoving(c)}
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))
        ) : (
          <NoData
            title="Nenhum conteúdo nesta seleção"
            description="Mude os filtros ou adicione uma nova pauta."
          />
        ))}
      <AlertDialog
        open={!!removing}
        onOpenChange={(v) => {
          if (!busy && !v) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mover conteúdo para a lixeira?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.title}. Ele sairá dos conteúdos e do calendário. Você
              poderá restaurá-lo com todas as versões. Cartões já enviados ao
              Trello permanecem lá.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="error">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                if (!removing) return;
                setBusy(true);
                setError('');
                try {
                  await act('deleteContent', { id: removing.id });
                  setRemoving(null);
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : 'Falha ao excluir.',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Movendo…' : 'Mover para lixeira'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
  // On phones the 7-column month grid does not fit; start in the list view.
  const narrow =
    typeof window !== 'undefined' &&
    window.matchMedia('(max-width: 640px)').matches;
  const [view, setView] = useState(() => (narrow ? 'list' : 'month'));
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
          {narrow && (
            <p className="form-hint calendar-swipe-hint">
              Deslize a grade para o lado para ver todos os dias da semana.
            </p>
          )}
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
