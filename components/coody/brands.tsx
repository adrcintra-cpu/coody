'use client';
import { useState } from 'react';
import { Plus, ArrowUpRight, Palette, BookOpen, Layers } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Field, FormModal } from './forms';
import { BrandMark, ContentRow } from './shared';
import type { State, Brand, Content, Action } from '@/lib/types';
const emptyBrand: Brand = {
  id: '',
  name: '',
  segment: '',
  description: '',
  website: '',
  social: '',
  voice: '',
  keywords: '',
  forbidden: '',
  direction: '',
  notes: '',
  colors: '',
  fonts: '',
  products: '',
  services: '',
  monthlyGoal: 12,
  weeklyGoal: 3,
  pillars: [
    { name: 'Institucional', percent: 50 },
    { name: 'Produtos', percent: 50 },
  ],
};
export function Brands({
  state,
  act,
  open,
  library,
}: {
  state: State;
  act: Action;
  open: (c: Content) => void;
  library: (id: string) => void;
}) {
  const [selected, setSelected] = useState('');
  const [editing, setEditing] = useState<Brand | null>(null);
  const b = state.brands.find((b) => b.id === selected);
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
        <button
          className="create-btn"
          onClick={() => setEditing(b || emptyBrand)}
        >
          <Plus size={17} />
          {b ? 'Editar marca' : 'Adicionar marca'}
        </button>
      </div>
      {b ? (
        <>
          <button className="text-btn back" onClick={() => setSelected('')}>
            ← Todas as marcas
          </button>
          <Tabs defaultValue="overview">
            <TabsList variant="line">
              <TabsTrigger value="overview">Visão geral</TabsTrigger>
              <TabsTrigger value="identity">Identidade e regras</TabsTrigger>
              <TabsTrigger value="history">Conteúdos anteriores</TabsTrigger>
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
                    <strong>{b.social || 'Não informado'}</strong>
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
                  <button className="outline-btn" onClick={() => library(b.id)}>
                    <BookOpen size={16} /> Abrir biblioteca{' '}
                    <ArrowUpRight size={15} />
                  </button>
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
            <TabsContent value="identity">
              <section className="panel identity-grid">
                {[
                  ['Tom de voz', b.voice],
                  ['Palavras importantes', b.keywords],
                  ['Palavras proibidas', b.forbidden],
                  ['Direção visual', b.direction],
                  ['Cores', b.colors],
                  ['Fontes', b.fonts],
                  ['Regras da IA e observações', b.notes],
                ].map(([label, value]) => (
                  <div key={label}>
                    <h3>{label}</h3>
                    <p className="muted">{value || 'Ainda não definido'}</p>
                  </div>
                ))}
              </section>
            </TabsContent>
            <TabsContent value="history">
              {state.contents
                .filter((c) => c.brandId === b.id)
                .map((c) => (
                  <ContentRow
                    key={c.id}
                    item={c}
                    brand={b}
                    onOpen={() => open(c)}
                  />
                ))}
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <div className="brand-grid">
          {state.brands.map((b) => (
            <button
              key={b.id}
              className="brand-card"
              onClick={() => setSelected(b.id)}
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
              ['social', 'Redes sociais'],
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
              ['notes', 'Regras da IA e observações'],
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
