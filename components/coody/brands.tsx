'use client';
import { ProfilePhoto } from './profile-photo';
import { useEffect, useState } from 'react';
import {
  Plus,
  ArrowUpRight,
  Palette,
  BookOpen,
  Layers,
  Power,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { BRAND_TRASH_DAYS, isInactive, trashDaysLeft } from '@/lib/brand-lifecycle';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Field, FormModal } from './forms';
import { BrandOnboarding } from './brand-onboarding';
import { BrandAssist } from './brand-assist';
import { LibraryView } from './library';
import { Planning } from './planning';
import { Contents } from './contents';
import { identityCompleteness } from '@/lib/brand-memory';
import { BrandMark } from './shared';
import type { State, Brand, Content, Action } from '@/lib/types';
export function Brands({
  state,
  act,
  open,
  reload,
  month,
  create,
}: {
  state: State;
  act: Action;
  open: (c: Content) => void;
  reload: () => Promise<void>;
  month: string;
  create: (date?: string, brandId?: string) => void;
}) {
  const [onboarding, setOnboarding] = useState(false);
  const route = () =>
    new URLSearchParams(
      typeof window === 'undefined'
        ? ''
        : window.location.hash.split('?')[1] || '',
    );
  const [brandTab, setBrandTab] = useState(
    () => route().get('tab') || 'overview',
  );
  const [selected, setSelected] = useState(() => route().get('brand') || '');
  const choose = (id: string, tab = 'overview') => {
    setSelected(id);
    setBrandTab(tab);
    const params = route();
    if (id) {
      params.set('brand', id);
      params.set('tab', tab);
    } else {
      params.delete('brand');
      params.delete('tab');
    }
    window.history.pushState(null, '', '#Marcas?' + params.toString());
  };
  useEffect(() => {
    const restore = () => {
      const p = new URLSearchParams(window.location.hash.split('?')[1] || '');
      setSelected(p.get('brand') || '');
      setBrandTab(p.get('tab') || 'overview');
    };
    window.addEventListener('popstate', restore);
    window.addEventListener('hashchange', restore);
    return () => {
      window.removeEventListener('popstate', restore);
      window.removeEventListener('hashchange', restore);
    };
  }, []);
  const [editing, setEditing] = useState<Brand | null>(null);
  // Lifecycle dialogs: inactivate/reactivate and move to the trash.
  const [statusTarget, setStatusTarget] = useState<Brand | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState('');
  const [restoring, setRestoring] = useState('');
  const closeLifecycle = () => {
    setStatusTarget(null);
    setDeleteTarget(null);
    setConfirmName('');
    setLifecycleError('');
  };
  const runLifecycle = async (
    action: string,
    data: Record<string, unknown>,
    after?: () => void,
  ) => {
    setLifecycleBusy(true);
    setLifecycleError('');
    try {
      await act(action, data);
      closeLifecycle();
      after?.();
    } catch (e) {
      setLifecycleError((e as Error).message);
    } finally {
      setLifecycleBusy(false);
    }
  };
  const activeBrands = state.brands.filter((x) => !isInactive(x));
  const inactiveBrands = state.brands.filter(isInactive);
  const trash = state.deletedBrands || [];
  const b = state.brands.find((b) => b.id === selected);
  const inactive = !!b && isInactive(b);
  const completeness = b ? identityCompleteness(b, state.assets) : null;
  const scoped = b
    ? {
        ...state,
        brands: [b],
        contents: state.contents.filter((c) => c.brandId === b.id),
        assets: state.assets.filter((a) => a.brandId === b.id),
        plans: state.plans.filter((p) => p.brandId === b.id),
      }
    : state;
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">INTELIGÊNCIA DE MARCA</p>
          <h1>{b ? b.name : 'Marcas'}</h1>
          <p>
            {b
              ? 'Um espaço para tudo que faz esta marca ser única.'
              : 'Cada marca, um universo de possibilidades.'}
          </p>
        </div>
        <div className="brand-actions">
          {b && (
            <>
              <button
                className="outline-btn"
                onClick={() =>
                  inactive
                    ? runLifecycle('setBrandStatus', { id: b.id, status: 'active' })
                    : setStatusTarget(b)
                }
                disabled={lifecycleBusy}
              >
                <Power size={16} /> {inactive ? 'Reativar' : 'Inativar'}
              </button>
              <button
                className="outline-btn danger"
                onClick={() => setDeleteTarget(b)}
              >
                <Trash2 size={16} /> Excluir
              </button>
            </>
          )}
          <button
            className="create-btn"
            onClick={() => (b ? setEditing(b) : setOnboarding(true))}
          >
            <Plus size={17} />
            {b ? 'Editar marca' : 'Adicionar marca'}
          </button>
        </div>
      </div>
      {lifecycleError && !statusTarget && !deleteTarget && (
        <p role="alert" className="notice error">
          {lifecycleError}
        </p>
      )}
      {b ? (
        <>
          <button className="text-btn back" onClick={() => choose('')}>
            ← Todas as marcas
          </button>
          {inactive && (
            <div className="notice brand-inactive-notice" role="status">
              <span>
                <strong>Marca inativa.</strong> Ela não aparece no Dashboard,
                no Calendário, nos seletores nem na criação de pautas. Os
                conteúdos, planejamentos e arquivos continuam guardados.
              </span>
              <button
                className="create-btn"
                disabled={lifecycleBusy}
                onClick={() =>
                  runLifecycle('setBrandStatus', { id: b.id, status: 'active' })
                }
              >
                <Power size={16} /> Reativar marca
              </button>
            </div>
          )}
          <Tabs
            value={
              inactive && !['overview', 'settings'].includes(brandTab)
                ? 'overview'
                : brandTab
            }
            onValueChange={(v) => choose(selected, String(v))}
          >
            <TabsList className="brand-tabs" variant="line">
              <TabsTrigger value="overview">Visão geral</TabsTrigger>
              {!inactive && (
                <>
                  <TabsTrigger value="planning">Planejamento</TabsTrigger>
                  <TabsTrigger value="contents">Conteúdos</TabsTrigger>
                  <TabsTrigger value="library">Biblioteca</TabsTrigger>
                </>
              )}
              <TabsTrigger value="settings">Configurações</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <div className="brand-overview">
                <section className="panel">
                  <BrandMark brand={b} />
                  <h2>{b.name}</h2>
                  <p className="muted">{b.segment}</p>
                  <p>
                    {b.description ||
                      'Adicione uma descrição para contextualizar a marca.'}
                  </p>
                  <div className="detail-line">
                    <span>Site</span>
                    <strong>{b.website || 'Não informado'}</strong>
                  </div>
                  <div className="detail-line">
                    <span>Redes sociais</span>
                    <strong>
                      {[b.instagram, b.linkedin, b.social]
                        .filter(Boolean)
                        .join(' · ') || 'Não informado'}
                    </strong>
                  </div>
                  <div className="detail-line">
                    <span>Meta mensal</span>
                    <strong>{b.monthlyGoal} conteúdos</strong>
                  </div>
                  <div className="detail-line">
                    <span>Produtos</span>
                    <strong>{b.products || 'Não informado'}</strong>
                  </div>
                  <div className="detail-line">
                    <span>Serviços</span>
                    <strong>{b.services || 'Não informado'}</strong>
                  </div>
                </section>
                <section className="panel">
                  <h2>Memória visual</h2>
                  <p className="muted">
                    Referências e artes aprovadas dão consistência a cada nova
                    ideia.
                  </p>
                  <div className="large-number">
                    {state.assets.filter((a) => a.brandId === b.id).length}
                    <small> arquivos na biblioteca</small>
                  </div>
                  <button
                    className="outline-btn"
                    disabled={inactive}
                    onClick={() => choose(selected, 'library')}
                  >
                    <BookOpen size={16} /> Abrir biblioteca{' '}
                    <ArrowUpRight size={15} />
                  </button>
                  <h2 className="section-space">
                    Identidade da marca · {completeness?.percent}%
                  </h2>
                  <p className="form-hint">
                    Complete quando quiser. Estes itens ajudam a orientar a
                    criação.
                  </p>
                  <div className="identity-checks">
                    {completeness?.checks.map((c) => (
                      <span
                        key={c.label}
                        className={c.complete ? 'complete' : ''}
                      >
                        {c.complete ? '✓' : '○'} {c.label}
                      </span>
                    ))}
                  </div>
                  <h2 className="section-space">Pilares de conteúdo</h2>
                  {b.pillars.map((p) => (
                    <div className="detail-line" key={p.name}>
                      <span>{p.name}</span>
                      <strong>{p.percent}%</strong>
                    </div>
                  ))}
                </section>
              </div>
            </TabsContent>
            <TabsContent value="settings">
              <ProfilePhoto
                url={b.avatarUrl}
                name={b.name}
                brandId={b.id}
                reload={reload}
              />
              <section className="panel identity-grid">
                {[
                  ['Tom de voz', b.voice],
                  ['Palavras importantes', b.keywords],
                  ['Palavras proibidas', b.forbidden],
                  ['Direção visual', b.direction],
                  ['Cores', b.colors],
                  ['Fontes', b.fonts],
                  ['Estilo de comunicação', b.communicationStyle],
                  ['Regras específicas', b.rules],
                  ['Orientações para criação', b.creationNotes],
                  ['Observações do cliente', b.notes],
                ].map(([label, value]) => (
                  <div key={label}>
                    <h3>{label}</h3>
                    <p className="muted">{value || 'Ainda não definido'}</p>
                  </div>
                ))}
              </section>
            </TabsContent>
            {!inactive && (
            <>
            <TabsContent value="planning" className="brand-module">
              <Planning
                key={b.id + month}
                state={scoped}
                month={month}
                act={act}
                open={open}
                create={create}
                fixedBrandId={b.id}
              />
            </TabsContent>
            <TabsContent value="contents" className="brand-module">
              <Contents
                act={act}
                reload={reload}
                key={b.id}
                state={scoped}
                month={month}
                open={open}
                create={create}
                fixedBrandId={b.id}
              />
            </TabsContent>
            <TabsContent value="library" className="brand-module">
              <LibraryView
                key={b.id}
                state={scoped}
                brandId={b.id}
                act={act}
                reload={reload}
              />
            </TabsContent>
            </>
            )}
          </Tabs>
        </>
      ) : (
        <>
        <div className="brand-grid">
          {activeBrands.map((b) => (
            <button
              key={b.id}
              className="brand-card"
              onClick={() => {
                choose(b.id);
              }}
            >
              <div className="brand-card-top">
                <BrandMark brand={b} />
                <ArrowUpRight size={18} />
              </div>
              <h2>{b.name}</h2>
              <p className="brand-segment">{b.segment}</p>
              <p className="muted">
                {b.description ||
                  'Um novo Brand Space, pronto para suas ideias.'}
              </p>
              <div className="brand-card-footer">
                <span>
                  <Layers size={14} />
                  {state.contents.filter((c) => c.brandId === b.id).length}{' '}
                  conteúdos
                </span>
                <span>
                  <Palette size={14} />
                  {state.assets.filter((a) => a.brandId === b.id).length}{' '}
                  arquivos
                </span>
              </div>
            </button>
          ))}
        </div>
        {!activeBrands.length && (
          <p className="muted">
            Nenhuma marca ativa. Adicione uma marca ou reative uma das marcas
            inativas abaixo.
          </p>
        )}
        {!!inactiveBrands.length && (
          <section className="brand-lifecycle-section">
            <h2>Marcas inativas</h2>
            <p className="muted">
              Fora do Dashboard, do Calendário e da criação. Os dados continuam
              guardados.
            </p>
            {inactiveBrands.map((x) => (
              <div className="trash-row" key={x.id}>
                <button className="brand-row-link" onClick={() => choose(x.id)}>
                  <BrandMark brand={x} />
                  <span>
                    <strong>{x.name}</strong>
                    <small className="muted"> · {x.segment}</small>
                  </span>
                </button>
                <button
                  className="outline-btn"
                  disabled={lifecycleBusy}
                  onClick={() =>
                    runLifecycle('setBrandStatus', { id: x.id, status: 'active' })
                  }
                >
                  <Power size={16} /> Reativar
                </button>
              </div>
            ))}
          </section>
        )}
        {!!trash.length && (
          <section className="brand-lifecycle-section">
            <h2>Lixeira de marcas</h2>
            <p className="muted">
              Marcas excluídas podem ser restauradas por {BRAND_TRASH_DAYS} dias,
              com conteúdos, planejamentos e arquivos. Depois disso, são
              apagadas de vez.
            </p>
            {trash.map((x) => {
              const days = trashDaysLeft(x.deletedAt);
              return (
                <div className="trash-row" key={x.id}>
                  <span>
                    <strong>{x.name}</strong>
                    <small className="muted">
                      {' '}
                      ·{' '}
                      {days > 1
                        ? `apagada de vez em ${days} dias`
                        : days === 1
                          ? 'apagada de vez em 1 dia'
                          : 'será apagada de vez em breve'}
                    </small>
                  </span>
                  <button
                    className="outline-btn"
                    disabled={!!restoring}
                    onClick={async () => {
                      setRestoring(x.id);
                      setLifecycleError('');
                      try {
                        await act('restoreBrand', { id: x.id });
                      } catch (e) {
                        setLifecycleError((e as Error).message);
                      } finally {
                        setRestoring('');
                      }
                    }}
                  >
                    <RotateCcw size={16} />{' '}
                    {restoring === x.id ? 'Restaurando…' : 'Restaurar'}
                  </button>
                </div>
              );
            })}
          </section>
        )}
        </>
      )}
      <AlertDialog
        open={!!statusTarget}
        onOpenChange={(open) => !open && !lifecycleBusy && closeLifecycle()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Inativar {statusTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              A marca sai do Dashboard, do Calendário, dos seletores e da
              criação de pautas. Conteúdos, planejamentos e arquivos ficam
              guardados, e você pode reativá-la a qualquer momento em Marcas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {lifecycleError && (
            <p role="alert" className="error">
              {lifecycleError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={lifecycleBusy}>Cancelar</AlertDialogCancel>
            <button
              className="create-btn"
              disabled={lifecycleBusy}
              onClick={() =>
                statusTarget &&
                runLifecycle('setBrandStatus', {
                  id: statusTarget.id,
                  status: 'inactive',
                })
              }
            >
              {lifecycleBusy ? 'Inativando…' : 'Inativar marca'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && !lifecycleBusy && closeLifecycle()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              A marca, os conteúdos, os planejamentos e os arquivos saem de
              todas as telas e vão para a lixeira de marcas. Você pode
              restaurar tudo por {BRAND_TRASH_DAYS} dias; depois disso, são
              apagados de vez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field label={`Digite "${deleteTarget?.name || ''}" para confirmar`}>
            <Input
              value={confirmName}
              autoComplete="off"
              onChange={(e) => setConfirmName(e.target.value)}
            />
          </Field>
          {lifecycleError && (
            <p role="alert" className="error">
              {lifecycleError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={lifecycleBusy}>Cancelar</AlertDialogCancel>
            <button
              className="create-btn danger-btn"
              disabled={
                lifecycleBusy ||
                confirmName.trim() !== (deleteTarget?.name || '').trim()
              }
              onClick={() =>
                deleteTarget &&
                runLifecycle(
                  'deleteBrand',
                  { id: deleteTarget.id, confirmName: confirmName.trim() },
                  () => choose(''),
                )
              }
            >
              {lifecycleBusy ? 'Excluindo…' : 'Mover para a lixeira'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {onboarding && (
        <BrandOnboarding
          close={() => setOnboarding(false)}
          created={async (id) => {
            await reload();
            choose(id);
            setOnboarding(false);
          }}
        />
      )}
      {editing && (
        <BrandEditor brand={editing} act={act} close={() => setEditing(null)} />
      )}
    </>
  );
}
function BrandEditor({
  brand,
  act,
  close,
}: {
  brand: Brand;
  act: Action;
  close: () => void;
}) {
  const [b, setB] = useState(structuredClone(brand));
  const [tab, setTab] = useState('general');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = (k: keyof Brand, v: unknown) => setB({ ...b, [k]: v });
  const total = b.pillars.reduce((s, p) => s + p.percent, 0);
  return (
    <FormModal
      open
      title={brand.id ? 'Editar Brand Space' : 'Nova marca'}
      description="Estas informações serão reutilizadas no planejamento e na criação."
      onClose={close}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await act('saveBrand', { ...b });
            close();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {brand.id && (
          <BrandAssist
            brand={b}
            onChange={setB}
            brandId={brand.id}
            // Existing brands keep their pillars and goals.
            defaults={{ pillars: [], monthlyGoal: -1, weeklyGoal: -1 }}
            hint="Sugere os campos ainda vazios a partir dos dados da marca, do site e do manual e logos da Biblioteca. Os campos preenchidos e os pilares atuais são mantidos."
          />
        )}
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
          <TabsList variant="line">
            <TabsTrigger value="general">Marca</TabsTrigger>
            <TabsTrigger value="identity">Identidade</TabsTrigger>
            <TabsTrigger value="pillars">Pilares e frequência</TabsTrigger>
          </TabsList>
          <TabsContent value="general">
            {[
              ['name', 'Nome'],
              ['segment', 'Segmento'],
              ['website', 'Site'],
              ['instagram', 'Instagram'],
              ['linkedin', 'LinkedIn'],
              ['social', 'Outras redes'],
            ].map(([k, l]) => (
              <Field key={k} label={l}>
                <Input
                  value={
                    b[
                      k as Exclude<
                        keyof Brand,
                        'pillars' | 'monthlyGoal' | 'weeklyGoal'
                      >
                    ]
                  }
                  onChange={(e) => update(k as keyof Brand, e.target.value)}
                />
              </Field>
            ))}
            {[
              ['description', 'Descrição'],
              ['products', 'Produtos'],
              ['services', 'Serviços'],
              ['notes', 'Observações do cliente'],
            ].map(([k, l]) => (
              <Field key={k} label={l}>
                <Textarea
                  value={
                    b[
                      k as Exclude<
                        keyof Brand,
                        'pillars' | 'monthlyGoal' | 'weeklyGoal'
                      >
                    ]
                  }
                  onChange={(e) => update(k as keyof Brand, e.target.value)}
                />
              </Field>
            ))}
          </TabsContent>
          <TabsContent value="identity">
            {[
              ['voice', 'Tom de voz'],
              ['colors', 'Cores (códigos hexadecimais)'],
              ['fonts', 'Fontes'],
              ['keywords', 'Palavras importantes'],
              ['forbidden', 'Palavras proibidas'],
              ['direction', 'Direção visual'],
              ['communicationStyle', 'Estilo de comunicação'],
              ['rules', 'Regras específicas'],
              ['creationNotes', 'Orientações para criação'],
            ].map(([k, l]) => (
              <Field key={k} label={l}>
                <Textarea
                  value={
                    b[
                      k as Exclude<
                        keyof Brand,
                        'pillars' | 'monthlyGoal' | 'weeklyGoal'
                      >
                    ]
                  }
                  onChange={(e) => update(k as keyof Brand, e.target.value)}
                />
              </Field>
            ))}
          </TabsContent>
          <TabsContent value="pillars">
            <div className="form-grid">
              <Field label="Posts / mês">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={b.monthlyGoal}
                  onChange={(e) =>
                    update('monthlyGoal', Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Posts / semana">
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={b.weeklyGoal}
                  onChange={(e) => update('weeklyGoal', Number(e.target.value))}
                />
              </Field>
            </div>
            {b.pillars.map((p, i) => (
              <div className="pillar-edit" key={i}>
                <Input
                  aria-label={'Nome do pilar ' + (i + 1)}
                  value={p.name}
                  onChange={(e) =>
                    update(
                      'pillars',
                      b.pillars.map((p, j) =>
                        i === j ? { ...p, name: e.target.value } : p,
                      ),
                    )
                  }
                />
                <Input
                  aria-label={'Percentual de ' + p.name}
                  type="number"
                  min={0}
                  max={100}
                  value={p.percent}
                  onChange={(e) =>
                    update(
                      'pillars',
                      b.pillars.map((p, j) =>
                        i === j ? { ...p, percent: Number(e.target.value) } : p,
                      ),
                    )
                  }
                />
                <span>%</span>
                <button
                  type="button"
                  aria-label={'Excluir pilar ' + p.name}
                  onClick={() =>
                    update(
                      'pillars',
                      b.pillars.filter((_, j) => i !== j),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <button
              className="text-btn"
              type="button"
              onClick={() =>
                update('pillars', [...b.pillars, { name: '', percent: 0 }])
              }
            >
              <Plus size={14} /> Adicionar pilar
            </button>
            <p className={total === 100 ? 'success' : 'error'}>
              Distribuição total: {total}% / 100%
            </p>
          </TabsContent>
        </Tabs>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="outline-btn" onClick={close}>
            Cancelar
          </button>
          <button className="create-btn" disabled={busy || total !== 100}>
            {busy ? 'Salvando…' : 'Salvar marca'}
          </button>
        </div>
      </form>
    </FormModal>
  );
}
