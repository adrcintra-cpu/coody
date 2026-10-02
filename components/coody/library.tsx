'use client';
import { assetLimitMB } from '@/lib/upload-limits';
import { can } from '@/lib/permissions';

import { useState } from 'react';
import {
  Upload,
  Folder,
  FileText,
  Star,
  Check,
  ArrowUpRight,
  Pencil,
  Trash2,
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
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { Picker, NoData } from './shared';
import { Field, FormModal } from './forms';
import {
  AssetFields,
  emptyAssetFields,
  type AssetFieldsValue,
} from './asset-fields';
import {
  assetCategories,
  canonicalCategory,
  categoryInfo,
} from '@/lib/brand-memory';
import { checkImageFile, fitUpload } from '@/lib/client-upload';
import type { State, Action, Asset } from '@/lib/types';
export const categories = assetCategories.map((c) => c.label);
export function LibraryView({
  state,
  act,
  reload,
  initialBrand,
  brandId,
}: {
  state: State;
  act: Action;
  reload: () => Promise<void>;
  initialBrand?: string;
  brandId?: string;
}) {
  const [selection, setSelection] = useState(initialBrand || '');
  const brand = brandId || selection;
  const selectedBrand = state.brands.find((b) => b.id === brand);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<Asset | 'new' | null>(null);
  // Removing files: one from its card, or several in selection mode.
  const canEdit = can(state.user?.role, 'edit');
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removal, setRemoval] = useState<{
    removed: string[];
    kept: { name: string; reason: string }[];
    error?: string;
  } | null>(null);
  const togglePick = (id: string) =>
    setPicked((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]));
  const removeFiles = async (ids: string[]) => {
    setRemoving(true);
    try {
      const r = await fetch('/api/assets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const d = (await r.json()) as {
        removed?: string[];
        kept?: { name: string; reason: string }[];
        error?: string;
      };
      if (!r.ok) throw new Error(d.error || 'Não foi possível excluir.');
      setRemoval({ removed: d.removed || [], kept: d.kept || [] });
      setPicked([]);
      setPicking(false);
      await reload();
    } catch (e) {
      setRemoval({ removed: [], kept: [], error: (e as Error).message });
    } finally {
      setRemoving(false);
      setConfirmIds(null);
    }
  };
  const items = state.assets
    .filter(
      (a) =>
        (brand === 'all' || a.brandId === brand) &&
        (category === 'all' ||
          canonicalCategory(a.category, a.approved) === category) &&
        [
          a.name,
          a.description,
          a.aiNotes,
          state.brands.find((b) => b.id === a.brandId)?.name,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        b.approved - a.approved ||
        b.createdAt.localeCompare(a.createdAt),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MEMÓRIA VISUAL</p>
          <h1>Biblioteca</h1>
          <p>
            {selectedBrand
              ? `Memória visual e identidade da ${selectedBrand.name}.`
              : brand === 'all'
                ? 'Localize e gerencie arquivos de todas as marcas.'
                : 'Selecione uma marca para abrir sua memória visual.'}
          </p>
        </div>
        {can(state.user?.role, 'edit') && (
          <button
            className="create-btn"
            disabled={!state.brands.length}
            onClick={() => setEditor('new')}
          >
            <Upload size={17} />
            Adicionar arquivos
          </button>
        )}
      </div>
      <div className="toolbar library-context">
        {brandId ? (
          <div className="selected-brand-context">
            <span>MARCA</span>
            <strong>{selectedBrand?.name}</strong>
          </div>
        ) : (
          <Field label="Marca">
            <Picker
              label="Selecionar marca"
              value={selection}
              onChange={(value) => {
                setSelection(value);
                const params = new URLSearchParams(
                  window.location.hash.split('?')[1] || '',
                );
                if (value) params.set('brand', value);
                else params.delete('brand');
                window.history.replaceState(
                  null,
                  '',
                  '#Biblioteca?' + params.toString(),
                );
              }}
              options={[
                { value: '', label: 'Selecionar marca' },
                { value: 'all', label: 'Todas as marcas' },
                ...state.brands.map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
          </Field>
        )}
        <Input
          aria-label="Buscar arquivo"
          placeholder="Buscar por nome, descrição ou marca…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Picker
          label="Filtrar categoria"
          value={category}
          onChange={setCategory}
          options={[{ value: 'all', label: 'Todos' }, ...assetCategories]}
        />
      </div>
      {brand === 'all' && (
        <p className="notice">
          Visão de gestão e localização. A criação e o contexto de IA sempre
          usam uma única marca.
        </p>
      )}
      <div className="library-folders">
        {assetCategories.map((c) => (
          <button
            key={c.value}
            className={category === c.value ? 'active' : ''}
            onClick={() => setCategory(category === c.value ? 'all' : c.value)}
          >
            <Folder size={25} />
            <strong>{c.label}</strong>
            <span>
              {
                state.assets.filter(
                  (a) =>
                    (brand === 'all' || a.brandId === brand) &&
                    canonicalCategory(a.category, a.approved) === c.value,
                ).length
              }
            </span>
          </button>
        ))}
      </div>
      {category !== 'all' && (
        <p className="notice">
          Pasta: {assetCategories.find((c) => c.value === category)?.label}.{' '}
          {category === 'product_photo'
            ? 'Envie fotos reais dos produtos e descreva nome, modelo e características; o COODY usará esses arquivos na criação.'
            : 'Novos arquivos serão adicionados nesta pasta.'}{' '}
          <button className="text-btn" onClick={() => setCategory('all')}>
            Ver todas as pastas
          </button>
        </p>
      )}
      {removal && (
        <div className={'notice' + (removal.error || removal.kept.length ? ' error' : '')} role="status">
          {removal.error ? (
            <p>{removal.error}</p>
          ) : (
            <>
              {!!removal.removed.length && (
                <p>
                  {removal.removed.length === 1
                    ? '1 arquivo excluído.'
                    : `${removal.removed.length} arquivos excluídos.`}
                </p>
              )}
              {removal.kept.map((k) => (
                <p key={k.name}>
                  <strong>{k.name}</strong> não foi excluído: {k.reason}. Troque a
                  arte dessa peça ou exclua a peça antes.
                </p>
              ))}
            </>
          )}
          <button className="text-btn" onClick={() => setRemoval(null)}>
            Fechar
          </button>
        </div>
      )}
      {canEdit && items.length > 0 && (
        <div className="library-select-bar">
          {picking ? (
            <>
              <span>{picked.length} selecionado(s)</span>
              <button
                className="text-btn"
                onClick={() =>
                  setPicked(picked.length === items.length ? [] : items.map((a) => a.id))
                }
              >
                {picked.length === items.length ? 'Limpar seleção' : 'Selecionar todos'}
              </button>
              <button
                className="outline-btn danger"
                disabled={!picked.length || removing}
                onClick={() => setConfirmIds(picked)}
              >
                <Trash2 size={15} /> Excluir selecionados
              </button>
              <button
                className="text-btn"
                onClick={() => {
                  setPicking(false);
                  setPicked([]);
                }}
              >
                Cancelar
              </button>
            </>
          ) : (
            <button className="text-btn" onClick={() => setPicking(true)}>
              Selecionar arquivos para excluir
            </button>
          )}
        </div>
      )}
      {items.length ? (
        <div className="asset-grid">
          {items.map((a) => (
            <article
              className={'asset-card' + (picked.includes(a.id) ? ' picked' : '')}
              key={a.id}
            >
              {picking && (
                <label className="asset-pick" aria-label={'Selecionar ' + a.name}>
                  <input
                    type="checkbox"
                    checked={picked.includes(a.id)}
                    onChange={() => togglePick(a.id)}
                  />
                </label>
              )}
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="asset-preview"
              >
                {a.mime.startsWith('image/') ? (
                  <Image
                    unoptimized
                    width={1080}
                    height={1350}
                    src={a.url}
                    alt={a.name}
                  />
                ) : (
                  <FileText size={46} />
                )}
                <ArrowUpRight className="asset-open" size={17} />
              </a>
              <div className="asset-info">
                <div className="asset-title">
                  <h3>{a.name}</h3>
                  <button
                    className="text-btn"
                    aria-label={'Editar ' + a.name}
                    onClick={() => setEditor(a)}
                  >
                    <Pencil size={14} />
                  </button>
                  {canEdit && (
                    <button
                      className="text-btn danger"
                      aria-label={'Excluir ' + a.name}
                      title="Excluir arquivo"
                      onClick={() => setConfirmIds([a.id])}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <p>
                  {categoryInfo(a.category, a.approved).label} ·{' '}
                  {a.mime.split('/').pop()?.toUpperCase()}
                </p>
                <p className="asset-brand">
                  {state.brands.find((b) => b.id === a.brandId)?.name} ·{' '}
                  {new Date(a.createdAt).toLocaleDateString('pt-BR')}
                </p>
                <p className="asset-description">
                  {a.description || 'Sem descrição.'}
                </p>
                <div className="asset-ai-notes">
                  <span>Observação para IA</span>
                  <p>{a.aiNotes || 'Nenhuma orientação adicionada.'}</p>
                </div>
                <div className="asset-flags">
                  {!!a.priority && (
                    <span>
                      <Star size={13} />
                      Prioritária
                    </span>
                  )}
                  {(a.approved === 1 || a.category === 'approved_art') && (
                    <span>
                      <Check size={13} />
                      Arte aprovada
                    </span>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <NoData
          title={
            !brand
              ? 'Escolha uma marca para começar'
              : 'Nenhum arquivo nesta seleção'
          }
          description={
            !brand
              ? 'A biblioteca de cada cliente tem seu próprio espaço.'
              : 'Adicione identidade, referências e materiais ou ajuste os filtros.'
          }
        />
      )}
      <AlertDialog
        open={!!confirmIds}
        onOpenChange={(open) => !open && !removing && setConfirmIds(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmIds?.length === 1
                ? `Excluir “${state.assets.find((a) => a.id === confirmIds[0])?.name || 'arquivo'}”?`
                : `Excluir ${confirmIds?.length || 0} arquivos?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Os arquivos saem da biblioteca e deixam de ser usados pela IA. Isso
              não pode ser desfeito. Arquivos usados na arte de alguma peça são
              mantidos e listados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <button
              className="create-btn danger-btn"
              disabled={removing}
              onClick={() => confirmIds && void removeFiles(confirmIds)}
            >
              {removing ? 'Excluindo…' : 'Excluir'}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {editor && (
        <AssetEditor
          initialCategory={category === 'all' ? 'material' : category}
          state={state}
          asset={editor === 'new' ? undefined : editor}
          brandId={editor === 'new' ? selectedBrand?.id || '' : editor.brandId}
          fixedBrand={!!selectedBrand || !!brandId || editor !== 'new'}
          close={() => setEditor(null)}
          saved={async (id) => {
            await reload();
            if (!brandId && !brand) setSelection(id);
            setEditor(null);
          }}
          act={act}
        />
      )}
    </>
  );
}
export function AssetEditor({
  initialCategory,
  state,
  asset,
  brandId,
  fixedBrand,
  close,
  saved,
  act,
}: {
  state: State;
  initialCategory: string;
  asset?: Asset;
  brandId: string;
  fixedBrand: boolean;
  close: () => void;
  saved: (brandId: string) => Promise<void>;
  act: Action;
}) {
  const [brand, setBrand] = useState(brandId);
  // New files: several at once, each with its own name and thumbnail.
  const [files, setFiles] = useState<
    { id: string; file: File; name: string; preview: string; error?: string }[]
  >([]);
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState('');
  const [uploadedAny, setUploadedAny] = useState(false);
  const [dragging, setDragging] = useState(false);
  const MAX_BATCH = 20;
  const addFiles = async (list: File[]) => {
    if (!list.length) return;
    if (files.length + list.length > MAX_BATCH) {
      setError(`Envie até ${MAX_BATCH} arquivos por vez.`);
      return;
    }
    setPreparing(true);
    setError('');
    const problems: string[] = [];
    const ready: typeof files = [];
    for (const original of list) {
      try {
        const file = await fitUpload(original, assetLimitMB);
        ready.push({
          id: crypto.randomUUID(),
          file,
          name: original.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 200),
          preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
        });
      } catch (e) {
        problems.push((e as Error).message);
      }
    }
    setFiles((old) => [...old, ...ready]);
    if (problems.length) setError(problems.join(' '));
    setPreparing(false);
  };
  const removeFile = (id: string) =>
    setFiles((old) => {
      const f = old.find((x) => x.id === id);
      if (f?.preview) URL.revokeObjectURL(f.preview);
      return old.filter((x) => x.id !== id);
    });
  const finish = () => (uploadedAny ? saved(brand) : close());
  const [value, setValue] = useState<AssetFieldsValue>(
    asset
      ? {
          name: asset.name,
          category: canonicalCategory(asset.category, asset.approved),
          description: asset.description,
          aiNotes: asset.aiNotes,
          priority: !!asset.priority,
        }
      : {
          ...emptyAssetFields,
          category: initialCategory as AssetFieldsValue['category'],
        },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <FormModal
      open
      onClose={() => {
        if (!busy) void finish();
      }}
      title={asset ? 'Detalhes do arquivo' : 'Adicionar arquivos'}
      description="O arquivo pertence a uma única marca. As orientações ajudam a compor seu contexto criativo."
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            if (!brand || brand === 'all')
              throw new Error('Selecione uma marca específica.');
            if (asset) {
              await act('saveAsset', {
                id: asset.id,
                brandId: brand,
                ...value,
              });
            } else {
              if (!files.length) throw new Error('Selecione ao menos um arquivo.');
              // One request per file (hosting limit); failures stay listed.
              let failed = 0;
              for (let i = 0; i < files.length; i++) {
                const f = files[i];
                setProgress(`Enviando ${i + 1} de ${files.length}…`);
                try {
                  if (!f.name.trim()) throw new Error('Informe o nome do arquivo.');
                  await checkImageFile(f.file);
                  const form = new FormData();
                  form.set('file', f.file);
                  form.set('brandId', brand);
                  Object.entries({ ...value, name: f.name.trim() }).forEach(([k, v]) =>
                    form.set(k, String(v)),
                  );
                  const response = await fetch('/api/assets', {
                    method: 'POST',
                    body: form,
                  });
                  const result = (await response.json()) as { error?: string };
                  if (!response.ok) throw new Error(result.error || 'Falha no envio.');
                  setUploadedAny(true);
                  removeFile(f.id);
                } catch (e) {
                  failed++;
                  setFiles((old) =>
                    old.map((x) =>
                      x.id === f.id ? { ...x, error: (e as Error).message } : x,
                    ),
                  );
                }
              }
              if (failed) {
                setError(
                  `${files.length - failed} de ${files.length} arquivos enviados. Corrija ou exclua os marcados e envie de novo.`,
                );
                return;
              }
            }
            await saved(brand);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
            setProgress('');
          }
        }}
      >
        <fieldset disabled={busy}>
          <Field label="Marca">
            {fixedBrand ? (
              <Input
                readOnly
                value={state.brands.find((b) => b.id === brand)?.name || ''}
              />
            ) : (
              <Picker
                label="Marca do arquivo"
                value={brand}
                onChange={setBrand}
                options={[
                  { value: '', label: 'Selecionar marca' },
                  ...state.brands.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
            )}
          </Field>
          {!asset && (
            <>
              <label
                className={'drop-zone' + (dragging ? ' dragging' : '')}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void addFiles(Array.from(e.dataTransfer.files));
                }}
              >
                <strong>Arraste arquivos aqui ou clique para escolher</strong>
                <small className="muted">
                  Vários de uma vez (até {MAX_BATCH}) · PDF, SVG, PNG, JPG e
                  WEBP · até {assetLimitMB} MB cada (fotos maiores são
                  reduzidas automaticamente)
                </small>
                <input
                  type="file"
                  multiple
                  hidden
                  accept=".pdf,.svg,.png,.jpg,.jpeg,.webp"
                  onChange={(e) => {
                    const list = Array.from(e.target.files || []) as File[];
                    e.target.value = '';
                    void addFiles(list);
                  }}
                />
              </label>
              {preparing && <p className="form-hint">Preparando arquivos…</p>}
              {!!files.length && (
                <ul className="upload-list">
                  {files.map((f) => (
                    <li key={f.id} className={f.error ? 'failed' : ''}>
                      {f.preview ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={f.preview} alt="" />
                      ) : (
                        <span className="upload-icon">
                          {f.file.name.split('.').pop()?.toUpperCase()}
                        </span>
                      )}
                      <div>
                        <Input
                          aria-label={'Nome de ' + f.file.name}
                          maxLength={200}
                          value={f.name}
                          onChange={(e) =>
                            setFiles((old) =>
                              old.map((x) =>
                                x.id === f.id ? { ...x, name: e.target.value } : x,
                              ),
                            )
                          }
                        />
                        <small className="muted">
                          {(f.file.size / 1024 / 1024).toFixed(1)} MB
                          {f.error ? ' · ' : ''}
                        </small>
                        {f.error && <small className="error">{f.error}</small>}
                      </div>
                      <button
                        type="button"
                        className="outline-btn"
                        aria-label={'Excluir ' + f.file.name}
                        onClick={() => removeFile(f.id)}
                      >
                        Excluir
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {files.length > 1 && (
                <p className="form-hint">
                  Categoria, descrição e observação abaixo valem para todos os
                  arquivos desta leva.
                </p>
              )}
            </>
          )}
          <AssetFields value={value} onChange={setValue} hideName={!asset} />
          <p className="form-hint">
            Papel no contexto: {categoryInfo(value.category).role}.
          </p>
        </fieldset>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button
            disabled={busy}
            type="button"
            className="outline-btn"
            onClick={() => void finish()}
          >
            {uploadedAny ? 'Fechar' : 'Cancelar'}
          </button>
          <button
            disabled={busy || preparing || (!asset && !files.length)}
            className="create-btn"
          >
            {busy
              ? progress || 'Salvando…'
              : asset
                ? 'Salvar detalhes'
                : files.length > 1
                  ? `Adicionar ${files.length} arquivos`
                  : 'Adicionar à biblioteca'}
          </button>
        </div>
      </form>
    </FormModal>
  );
}
