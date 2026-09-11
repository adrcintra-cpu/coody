'use client';
import { useState } from 'react';
import { CalendarRange, Plus, Sparkles, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Picker, ContentRow, NoData, Meter } from './shared';
import { Field, FormModal } from './forms';
import { planProposal } from '@/lib/domain';
import type { State, Action, Content, Plan } from '@/lib/types';
export function Planning({
  state,
  month,
  act,
  open,
  create,
  fixedBrandId,
}: {
  fixedBrandId?: string;
  state: State;
  month: string;
  act: Action;
  open: (c: Content) => void;
  create: (date?: string, brandId?: string) => void;
}) {
  const [brandId, setBrandId] = useState(
    fixedBrandId || state.brands[0]?.id || '',
  );
  const b = state.brands.find((b) => b.id === brandId);
  const [monthly, setMonthly] = useState(b?.monthlyGoal || 12);
  const [weekly, setWeekly] = useState(b?.weeklyGoal || 3);
  const [days, setDays] = useState([2, 4, 6]);
  const [campaign, setCampaign] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [proposal, setProposal] = useState<ReturnType<typeof planProposal>>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [addDate, setAddDate] = useState(false);
  const items = state.contents.filter(
    (c) => c.brandId === brandId && c.date.startsWith(month),
  );
  const relevant = state.dates.filter((d) => d.date.startsWith(month));
  const plan: Plan = {
    id: '',
    brandId,
    month,
    monthlyGoal: monthly,
    weeklyGoal: weekly,
    days,
    campaign,
    selectedDates: selected,
  };
  const saved = state.plans.find(
    (p) => p.brandId === brandId && p.month === month,
  );
  const concentrated =
    b?.pillars.filter(
      (p) =>
        items.length >= 4 &&
        (items.filter((c) => c.pillar === p.name).length / items.length) * 100 >
          p.percent + 15,
    ) || [];
  const missingDates = relevant.filter(
    (d) =>
      (saved?.selectedDates || selected).includes(d.id) &&
      !items.some((c) => c.date === d.date),
  );
  const weekGoal = saved?.weeklyGoal || weekly;
  const weeklyCounts = Array.from(
    {
      length: Math.ceil(
        new Date(
          Number(month.slice(0, 4)),
          Number(month.slice(5)),
          0,
        ).getDate() / 7,
      ),
    },
    (_, i) =>
      items.filter((c) => Math.floor((Number(c.date.slice(8)) - 1) / 7) === i),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ESTRATÉGIA ANTES DA CRIAÇÃO</p>
          <h1>Planejamento</h1>
          <p>Um mês com intenção. Uma pauta de cada vez.</p>
        </div>
        <button
          className="outline-btn"
          onClick={() => create(month + '-15', brandId)}
        >
          <Plus size={16} /> Nova pauta
        </button>
      </div>
      <div className="toolbar">
        {fixedBrandId ? (
          <span className="selected-brand-context">
            Marca: <strong>{b?.name}</strong>
          </span>
        ) : (
          <Picker
            value={brandId}
            label="Marca"
            onChange={(v) => {
              setBrandId(v);
              const brand = state.brands.find((b) => b.id === v);
              setMonthly(brand?.monthlyGoal || 12);
              setWeekly(brand?.weeklyGoal || 3);
              setProposal([]);
              setSelected([]);
            }}
            options={state.brands.map((b) => ({ value: b.id, label: b.name }))}
          />
        )}
        <span className="muted">
          {items.length} pautas ·{' '}
          {
            items.filter((c) => ['APROVADO', 'PUBLICADO'].includes(c.status))
              .length
          }{' '}
          aprovadas
        </span>
      </div>
      <div className="weekly-grid">
        {weeklyCounts.map((cs, i) => (
          <div className="week-meter" key={i}>
            <span>SEMANA {String(i + 1).padStart(2, '0')}</span>
            <strong>
              {cs.length}
              <small> / {weekGoal}</small>
            </strong>
            <Meter
              value={(cs.length / weekGoal) * 100}
              label={'Meta semana ' + (i + 1)}
            />
            <small className={cs.length === weekGoal ? 'success' : 'muted'}>
              {cs.length === weekGoal
                ? 'No ritmo'
                : cs.length < weekGoal
                  ? `${weekGoal - cs.length} conteúdo(s) a planejar`
                  : `${cs.length - weekGoal} acima da meta`}
            </small>
          </div>
        ))}
      </div>
      {concentrated.length > 0 && (
        <p className="notice">
          Concentração acima da distribuição prevista:{' '}
          {concentrated.map((p) => p.name).join(', ')}. Revise os pilares das
          pautas.
        </p>
      )}
      {missingDates.length > 0 && (
        <p className="notice">
          Datas selecionadas ainda sem conteúdo:{' '}
          {missingDates.map((d) => d.name).join(', ')}.
        </p>
      )}
      <div className="planning-layout">
        <section className="panel">
          <h2>Direção do mês</h2>
          <p className="muted">
            {saved
              ? 'Planejamento salvo. Ajuste as pautas ao lado.'
              : 'Defina o ritmo e organize uma proposta inicial.'}
          </p>
          <div className="form-grid">
            <Field label="Posts no mês">
              <Input
                disabled={!!saved}
                type="number"
                min={1}
                max={100}
                value={saved?.monthlyGoal ?? monthly}
                onChange={(e) => {
                  setMonthly(Number(e.target.value));
                  setProposal([]);
                }}
              />
            </Field>
            <Field label="Posts por semana">
              <Input
                disabled={!!saved}
                type="number"
                min={1}
                max={30}
                value={saved?.weeklyGoal ?? weekly}
                onChange={(e) => setWeekly(Number(e.target.value))}
              />
            </Field>
          </div>
          <Field label="Dias preferenciais">
            <div className="day-options">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((d, i) => (
                <label
                  key={d}
                  className={
                    (saved?.days || days).includes(i) ? 'selected' : ''
                  }
                >
                  <Checkbox
                    disabled={!!saved}
                    checked={(saved?.days || days).includes(i)}
                    onCheckedChange={(v) => {
                      setDays(v ? [...days, i] : days.filter((d) => d !== i));
                      setProposal([]);
                    }}
                  />
                  {d}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Campanhas e prioridades">
            <Textarea
              disabled={!!saved}
              value={saved?.campaign ?? campaign}
              onChange={(e) => {
                setCampaign(e.target.value);
                setProposal([]);
              }}
              placeholder="O que merece destaque neste mês?"
            />
          </Field>
          <h3 className="section-space">Distribuição dos pilares</h3>
          {b?.pillars.map((p) => (
            <div className="detail-line" key={p.name}>
              <span>{p.name}</span>
              <strong>{p.percent}%</strong>
            </div>
          ))}
          <h3 className="section-space">Datas para considerar</h3>
          <p className="form-hint">
            Selecione apenas as que fazem sentido. A relevância considera o
            segmento cadastrado.
          </p>
          {relevant.map((d) => (
            <label className="special-date" key={d.id}>
              <Checkbox
                disabled={!!saved}
                checked={(saved?.selectedDates || selected).includes(d.id)}
                onCheckedChange={(v) => {
                  setSelected(
                    v
                      ? [...selected, d.id]
                      : selected.filter((s) => s !== d.id),
                  );
                  setProposal([]);
                }}
              />
              <span>
                {d.name}
                <small>
                  {d.date.slice(8)}/{d.date.slice(5, 7)} ·{' '}
                  {d.segments.includes(b?.segment || '—')
                    ? 'Alta relevância'
                    : 'Baixa relevância'}
                </small>
              </span>
            </label>
          ))}
          <button className="text-btn" onClick={() => setAddDate(true)}>
            <Plus size={14} /> Cadastrar data própria
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {!saved && (
            <>
              <button
                className="create-btn full section-space"
                onClick={() => {
                  setError('');
                  try {
                    if (!b) throw new Error('Selecione uma marca');
                    setProposal(planProposal(b, plan, state.dates, items));
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <CalendarRange size={17} /> Montar proposta demonstrativa
              </button>
              <p className="form-hint">
                <Sparkles size={12} /> Planejar mês com IA estará disponível
                após a conexão OpenAI.
              </p>
            </>
          )}
        </section>
        <section>
          <div className="section-head">
            <h2>
              {proposal.length ? 'Proposta para revisar' : 'Pautas do mês'}
            </h2>
            <span className="muted">
              {proposal.length || items.length} conteúdos
            </span>
          </div>
          {proposal.length ? (
            <>
              <p className="notice">
                Proposta por regras, sem IA. Pilares distribuídos conforme os
                percentuais. Você poderá editar e mover cada pauta após salvar.
              </p>
              {proposal.map((p, i) => (
                <div className="proposal-row" key={i}>
                  <span className="proposal-day">{p.date.slice(8)}</span>
                  <div>
                    <strong>{p.title}</strong>
                    <small>
                      {p.pillar} · {p.format}
                    </small>
                  </div>
                </div>
              ))}
              <button
                className="create-btn section-space"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await act('savePlan', { ...plan });
                    setProposal([]);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Check size={17} />
                {busy ? 'Salvando…' : 'Salvar planejamento'}
              </button>
            </>
          ) : items.length ? (
            items
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((c) => (
                <ContentRow
                  key={c.id}
                  item={c}
                  brand={b}
                  onOpen={() => open(c)}
                />
              ))
          ) : (
            <NoData
              title="Um mês pronto para ganhar ideias"
              description="Configure a frequência, os pilares e as datas para montar o planejamento."
            />
          )}
          {items.length > 0 && (
            <div className="production-counts">
              {[
                ['Planejados', items.length],
                [
                  'Criados',
                  items.filter(
                    (c) => !['IDEIA', 'PLANEJADO'].includes(c.status),
                  ).length,
                ],
                [
                  'Aprovados',
                  items.filter((c) =>
                    ['APROVADO', 'PUBLICADO'].includes(c.status),
                  ).length,
                ],
                [
                  'Publicados',
                  items.filter((c) => c.status === 'PUBLICADO').length,
                ],
              ].map(([l, n]) => (
                <span key={l}>
                  {l}
                  <strong>{n}</strong>
                </span>
              ))}
            </div>
          )}
        </section>
      </div>
      {addDate && (
        <DateForm month={month} act={act} close={() => setAddDate(false)} />
      )}
    </>
  );
}
function DateForm({
  month,
  act,
  close,
}: {
  month: string;
  act: Action;
  close: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <FormModal
      open
      onClose={close}
      title="Data da marca"
      description="Aniversários, lançamentos e momentos que merecem uma pauta."
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await act('createDate', Object.fromEntries(data));
            close();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Nome">
          <Input name="name" required />
        </Field>
        <Field label="Data">
          <Input
            name="date"
            type="date"
            defaultValue={month + '-15'}
            required
          />
        </Field>
        <Field label="Segmentos (separados por vírgula)">
          <Input name="segments" placeholder="Tecnologia, Comercial" />
        </Field>
        {error && <p className="error">{error}</p>}
        <button className="create-btn" disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar data'}
        </button>
      </form>
    </FormModal>
  );
}
