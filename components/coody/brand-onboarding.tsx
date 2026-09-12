'use client';
import { useRef, useState } from 'react';
import { Check, FileText, Trash2, ArrowLeft, ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Field, FormModal } from './forms';
import {
  AssetFields,
  emptyAssetFields,
  type AssetFieldsValue,
} from './asset-fields';
import { categoryInfo } from '@/lib/brand-memory';
import { checkImageFile } from '@/lib/client-upload';
import { useDiscardGuard } from './discard-guard';
import type { Brand } from '@/lib/types';
export const newBrand: Brand = {
  id: '',
  name: '',
  segment: '',
  description: '',
  website: '',
  social: '',
  instagram: '',
  linkedin: '',
  voice: '',
  keywords: '',
  forbidden: '',
  direction: '',
  notes: '',
  communicationStyle: '',
  rules: '',
  creationNotes: '',
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
type PendingAsset = AssetFieldsValue & {
  id: string;
  file: File;
  step: 'identity' | 'references';
};
const steps = [
  'Informações',
  'Identidade',
  'Referências',
  'Regras da marca',
  'Finalizar',
];
export function BrandOnboarding({
  close,
  created,
}: {
  close: () => void;
  created: (id: string) => Promise<void>;
}) {
  const [brand, setBrand] = useState<Brand>(structuredClone(newBrand));
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<PendingAsset[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef('');
  const guard = useDiscardGuard(
    files.length > 0 || JSON.stringify(brand) !== JSON.stringify(newBrand),
    busy,
    close,
  );
  const update = (k: keyof Brand, v: string) => setBrand({ ...brand, [k]: v });
  const section = step === 1 ? 'identity' : 'references';
  const visible = files.filter((f) => f.step === section);
  const valid = () => {
    if (!brand.name.trim() || !brand.segment.trim()) {
      setError('Preencha o nome e o segmento da marca.');
      setStep(0);
      return false;
    }
    setError('');
    return true;
  };
  const changeStep = (i: number) => {
    if (!busy && (i === 0 || valid())) setStep(i);
  };
  const add = (list: FileList | null, category: string, label: string) => {
    if (!list) return;
    const additions = Array.from(list);
    const count = files.length + additions.length;
    const total = [...files.map((f) => f.file), ...additions].reduce(
      (n, f) => n + f.size,
      0,
    );
    if (
      count > 12 ||
      total > 25 * 1024 * 1024 ||
      additions.some((f) => f.size > 20 * 1024 * 1024)
    ) {
      setError(
        'Use até 12 arquivos, 20 MB por arquivo e 25 MB no total. Você pode adicionar mais depois na Biblioteca.',
      );
      return;
    }
    setFiles([
      ...files,
      ...additions.map((file) => ({
        ...emptyAssetFields,
        id: crypto.randomUUID(),
        file,
        category,
        name: label ? label + ' — ' + file.name : file.name,
        step: section as PendingAsset['step'],
      })),
    ]);
    setError('');
  };
  const upload = (label: string, category: string, multiple = true) => (
    <Field key={label} label={label}>
      <Input
        type="file"
        accept=".pdf,.svg,.png,.jpg,.jpeg,.webp"
        multiple={multiple}
        disabled={busy}
        onChange={(e) => {
          add(e.target.files, category, label);
          e.target.value = '';
        }}
      />
    </Field>
  );
  return (
    <>
      {' '}
      <FormModal
        title="Nova marca"
        description="Configure a identidade e comece a memória da marca. Apenas nome e segmento são obrigatórios."
        open
        onClose={guard.requestClose}
      >
        <Tabs value={String(step)} onValueChange={(v) => changeStep(Number(v))}>
          <TabsList className="onboarding-steps" variant="line">
            {steps.map((s, i) => (
              <TabsTrigger disabled={busy} key={s} value={String(i)}>
                <span>{i + 1}</span>
                {s}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (step !== 4) {
              if (valid()) setStep(step + 1);
              return;
            }
            if (!valid()) return;
            setBusy(true);
            try {
              requestId.current ||= crypto.randomUUID();
              for (const asset of files) await checkImageFile(asset.file);
              const form = new FormData();
              form.set(
                'payload',
                JSON.stringify({
                  id: requestId.current,
                  brand,
                  assets: files.map(
                    ({ name, category, description, aiNotes, priority }) => ({
                      name,
                      category,
                      description,
                      aiNotes,
                      priority,
                    }),
                  ),
                }),
              );
              files.forEach((f) => form.append('files', f.file));
              const response = await fetch('/api/brands', {
                method: 'POST',
                body: form,
              });
              const result = (await response.json()) as {
                id: string;
                error?: string;
              };
              if (!response.ok) throw new Error(result.error);
              await created(result.id);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy} className="onboarding-fields">
            {step === 0 && (
              <>
                <div className="form-grid">
                  {[
                    ['name', 'Nome da marca *'],
                    ['segment', 'Segmento *'],
                  ].map(([k, label]) => (
                    <Field key={k} label={label}>
                      <Input
                        value={brand[k as 'name' | 'segment']}
                        onChange={(e) =>
                          update(k as keyof Brand, e.target.value)
                        }
                      />
                    </Field>
                  ))}
                </div>
                <Field label="Descrição">
                  <Textarea
                    value={brand.description}
                    onChange={(e) => update('description', e.target.value)}
                  />
                </Field>
                <div className="form-grid">
                  {[
                    ['website', 'Site'],
                    ['instagram', 'Instagram'],
                    ['linkedin', 'LinkedIn'],
                    ['social', 'Outras redes'],
                  ].map(([k, label]) => (
                    <Field key={k} label={label}>
                      <Input
                        value={
                          brand[
                            k as 'website' | 'instagram' | 'linkedin' | 'social'
                          ]
                        }
                        onChange={(e) =>
                          update(k as keyof Brand, e.target.value)
                        }
                      />
                    </Field>
                  ))}
                </div>
                {[
                  ['products', 'Produtos'],
                  ['services', 'Serviços'],
                  ['notes', 'Observações do cliente'],
                ].map(([k, label]) => (
                  <Field key={k} label={label}>
                    <Textarea
                      rows={2}
                      value={brand[k as 'products' | 'services' | 'notes']}
                      onChange={(e) => update(k as keyof Brand, e.target.value)}
                    />
                  </Field>
                ))}
              </>
            )}
            {step === 1 && (
              <>
                <p className="form-hint">
                  Arquivos oficiais da identidade. Todos os campos desta etapa
                  são opcionais.
                </p>
                <div className="form-grid">
                  {upload('Logo principal', 'logo', false)}
                  {upload('Variações do logo', 'logo')}
                  {upload('Brandbook', 'brandbook')}
                  {upload('Elementos gráficos', 'logo')}
                </div>
                <Field label="Paleta de cores">
                  <Input
                    placeholder="#FFFFFF, #111111"
                    value={brand.colors}
                    onChange={(e) => update('colors', e.target.value)}
                  />
                </Field>
                <Field label="Fontes da marca">
                  <Input
                    placeholder="Nome das fontes e orientações de uso"
                    value={brand.fonts}
                    onChange={(e) => update('fonts', e.target.value)}
                  />
                </Field>
              </>
            )}
            {step === 2 && (
              <>
                <p className="form-hint">
                  Adicione referências de arte, posts, campanhas, fotografias,
                  produtos e materiais institucionais. Classifique cada arquivo
                  abaixo.
                </p>
                {upload('Adicionar referências', 'visual_reference')}
              </>
            )}
            {(step === 1 || step === 2) && (
              <>
                <p className="form-hint">
                  {files.length} / 12 arquivos · 20 MB por arquivo · 25 MB por
                  cadastro
                </p>
                {visible.map((f) => (
                  <section className="pending-asset" key={f.id}>
                    <div className="section-head">
                      <h3>
                        <FileText size={16} />
                        {f.file.name}
                      </h3>
                      <button
                        type="button"
                        aria-label={'Remover ' + f.file.name}
                        className="text-btn"
                        onClick={() =>
                          setFiles(files.filter((a) => a.id !== f.id))
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <AssetFields
                      prefix={f.id}
                      value={f}
                      onChange={(value) =>
                        setFiles(
                          files.map((a) =>
                            a.id === f.id ? { ...a, ...value } : a,
                          ),
                        )
                      }
                    />
                  </section>
                ))}
              </>
            )}
            {step === 3 && (
              <>
                {[
                  ['voice', 'Tom de voz'],
                  ['direction', 'Direção visual'],
                  ['communicationStyle', 'Estilo de comunicação'],
                  ['keywords', 'Palavras importantes'],
                  ['forbidden', 'Palavras que devem ser evitadas'],
                  ['rules', 'Regras específicas'],
                  ['creationNotes', 'Observações para criação'],
                ].map(([k, label]) => (
                  <Field key={k} label={label}>
                    <Textarea
                      rows={2}
                      value={
                        brand[
                          k as
                            | 'voice'
                            | 'direction'
                            | 'communicationStyle'
                            | 'keywords'
                            | 'forbidden'
                            | 'rules'
                            | 'creationNotes'
                        ]
                      }
                      onChange={(e) => update(k as keyof Brand, e.target.value)}
                    />
                  </Field>
                ))}
              </>
            )}
            {step === 4 && (
              <section className="onboarding-summary">
                <h2>{brand.name}</h2>
                <p className="muted">{brand.segment}</p>
                <p>{brand.description}</p>
                <div className="detail-line">
                  <span>Biblioteca</span>
                  <strong>
                    {files.length} arquivos vinculados a {brand.name}
                  </strong>
                </div>
                {files.map((f) => (
                  <div className="detail-line" key={f.id}>
                    <span>{f.name}</span>
                    <strong>{categoryInfo(f.category).label}</strong>
                  </div>
                ))}
                <div className="detail-line">
                  <span>Tom de voz</span>
                  <strong>{brand.voice || 'Pode ser informado depois'}</strong>
                </div>
                <p className="form-hint">
                  Ao finalizar, a marca, os arquivos e as regras serão salvos
                  juntos. Você poderá completar a identidade e ajustar a
                  frequência nas configurações da marca.
                </p>
              </section>
            )}
          </fieldset>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              disabled={busy}
              type="button"
              className="outline-btn"
              onClick={() =>
                step ? changeStep(step - 1) : guard.requestClose()
              }
            >
              <ArrowLeft size={15} />
              {step ? 'Voltar' : 'Cancelar'}
            </button>
            <button disabled={busy} className="create-btn">
              {busy
                ? 'Salvando marca…'
                : step === 4
                  ? 'Finalizar cadastro'
                  : 'Continuar'}
              {step === 4 ? <Check size={15} /> : <ArrowRight size={15} />}
            </button>
          </div>
        </form>
      </FormModal>
      {guard.dialog}
    </>
  );
}
