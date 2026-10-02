'use client';
import { assetLimitMB } from '@/lib/upload-limits';

import { useEffect, useRef, useState } from 'react';
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
import { checkImageFile, fitUpload } from '@/lib/client-upload';
import { useDiscardGuard } from './discard-guard';
import { BrandAssist } from './brand-assist';
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
  /** Thumbnail for images (object URL, revoked on removal). */
  preview: string;
  /** Library id once uploaded (a retry skips it). */
  uploadedId?: string;
};
const MAX_FILES = 20;
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
  const [adding, setAdding] = useState(false);
  const [progress, setProgress] = useState('');
  // Brand created but some files failed: list them instead of closing.
  const [partial, setPartial] = useState<{ id: string; failed: string[] } | null>(null);
  const previews = useRef<string[]>([]);
  useEffect(
    () => () => previews.current.forEach((u) => URL.revokeObjectURL(u)),
    [],
  );
  const remove = (id: string) => {
    const f = files.find((a) => a.id === id);
    if (f?.preview) URL.revokeObjectURL(f.preview);
    setFiles((list) => list.filter((a) => a.id !== id));
  };
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
  // Each file is uploaded on its own after the brand is created, so there is
  // no total limit; large photos are reduced in the browser to fit.
  const add = async (list: FileList | null, category: string, label: string) => {
    if (!list?.length) return;
    const additions = Array.from(list);
    if (files.length + additions.length > MAX_FILES) {
      setError(`Use até ${MAX_FILES} arquivos no cadastro. Você pode adicionar mais depois na Biblioteca.`);
      return;
    }
    setAdding(true);
    setError('');
    const accepted: PendingAsset[] = [];
    const problems: string[] = [];
    for (const original of additions) {
      try {
        const file = await fitUpload(original, assetLimitMB);
        const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : '';
        if (preview) previews.current.push(preview);
        accepted.push({
          ...emptyAssetFields,
          id: crypto.randomUUID(),
          file,
          preview,
          category,
          name: (label && label !== 'Adicionar referências'
            ? label + ' — ' + original.name
            : original.name
          ).slice(0, 200),
          step: section as PendingAsset['step'],
        });
      } catch (e) {
        problems.push((e as Error).message);
      }
    }
    setFiles((old) => [...old, ...accepted]);
    if (problems.length) setError(problems.join(' '));
    setAdding(false);
  };
  const upload = (label: string, category: string, multiple = true) => (
    <Field key={label} label={label}>
      <Input
        type="file"
        accept=".pdf,.svg,.png,.jpg,.jpeg,.webp"
        multiple={multiple}
        disabled={busy || adding}
        onChange={(e) => {
          const list = e.target.files;
          // Copy before clearing: the FileList is live.
          const copy = list ? (Array.from(list) as File[]) : [];
          e.target.value = '';
          const dt = new DataTransfer();
          copy.forEach((f) => dt.items.add(f));
          void add(dt.files, category, label);
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
            setError('');
            try {
              requestId.current ||= crypto.randomUUID();
              for (const asset of files) await checkImageFile(asset.file);
              // 1) The brand itself (no files: they go one by one below).
              setProgress('Salvando a marca…');
              const form = new FormData();
              form.set(
                'payload',
                JSON.stringify({ id: requestId.current, brand, assets: [] }),
              );
              const response = await fetch('/api/brands', {
                method: 'POST',
                body: form,
              });
              const result = (await response.json()) as {
                id: string;
                error?: string;
              };
              if (!response.ok) throw new Error(result.error);
              // 2) Each file in its own request (within the hosting limit).
              const failed: string[] = [];
              const pending = files.filter((f) => !f.uploadedId);
              for (let i = 0; i < pending.length; i++) {
                const f = pending[i];
                setProgress(`Enviando arquivo ${i + 1} de ${pending.length}…`);
                try {
                  const body = new FormData();
                  body.set('file', f.file);
                  body.set('brandId', result.id);
                  body.set('name', f.name);
                  body.set('category', f.category);
                  body.set('description', f.description);
                  body.set('aiNotes', f.aiNotes);
                  body.set('priority', String(f.priority));
                  const r = await fetch('/api/assets', { method: 'POST', body });
                  const data = (await r.json()) as { id?: string; error?: string };
                  if (!r.ok || !data.id) throw new Error(data.error || 'falha no envio');
                  setFiles((list) =>
                    list.map((a) => (a.id === f.id ? { ...a, uploadedId: data.id } : a)),
                  );
                } catch (e) {
                  failed.push(`${f.file.name} (${(e as Error).message})`);
                }
              }
              if (failed.length) setPartial({ id: result.id, failed });
              else await created(result.id);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
              setProgress('');
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
                <BrandAssist
                  brand={brand}
                  onChange={setBrand}
                  defaults={newBrand}
                  files={files}
                  hint="Com nome, segmento e, se tiver, site e anotações, a IA sugere descrição, produtos, tom de voz, regras, cores e pilares. Ela só preenche campos vazios, inclusive das próximas etapas, e nada é salvo antes de você finalizar."
                />
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
                  {files.length} / {MAX_FILES} arquivos · até {assetLimitMB} MB
                  por arquivo (fotos maiores são reduzidas automaticamente)
                  {adding ? ' · preparando arquivos…' : ''}
                </p>
                {error && (
                  <p className="error" role="alert">
                    {error}
                  </p>
                )}
                {!visible.length && !adding && (
                  <p className="muted">Nenhum arquivo adicionado nesta etapa.</p>
                )}
                {visible.map((f) => (
                  <section className="pending-asset" key={f.id}>
                    <div className="section-head">
                      <h3>
                        {f.preview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img className="pending-thumb" src={f.preview} alt="" />
                        ) : (
                          <FileText size={16} />
                        )}
                        <span>
                          {f.file.name}
                          <small className="muted">
                            {' '}
                            · {(f.file.size / 1024 / 1024).toFixed(1)} MB
                          </small>
                        </span>
                      </h3>
                      <button
                        type="button"
                        aria-label={'Excluir ' + f.file.name}
                        className="outline-btn pending-remove"
                        onClick={() => remove(f.id)}
                      >
                        <Trash2 size={15} /> Excluir
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
                <BrandAssist
                  brand={brand}
                  onChange={setBrand}
                  defaults={newBrand}
                  files={files}
                  hint="Agora a IA também lê o manual e os logos enviados na etapa Identidade para sugerir as regras, cores e fontes que ainda estão vazias."
                />
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
                  <div className="detail-line pending-summary" key={f.id}>
                    <span>
                      {f.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="pending-thumb" src={f.preview} alt="" />
                      ) : (
                        <FileText size={16} />
                      )}
                      {f.name}
                    </span>
                    <strong>
                      {categoryInfo(f.category).label}
                      <button
                        type="button"
                        className="text-btn"
                        aria-label={'Excluir ' + f.file.name}
                        disabled={busy}
                        onClick={() => remove(f.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </strong>
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
          {error && step !== 1 && step !== 2 && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {partial && (
            <div className="notice error" role="alert">
              <p>
                <strong>A marca foi criada</strong>, mas{' '}
                {partial.failed.length === 1
                  ? 'um arquivo não foi enviado'
                  : `${partial.failed.length} arquivos não foram enviados`}
                : {partial.failed.join('; ')}.
              </p>
              <p>
                Tente “Finalizar cadastro” de novo para reenviar só os que
                faltam, ou siga para a marca e adicione depois na Biblioteca.
              </p>
              <button
                type="button"
                className="outline-btn"
                onClick={() => created(partial.id)}
              >
                Ir para a marca
              </button>
            </div>
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
                ? progress || 'Salvando marca…'
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
