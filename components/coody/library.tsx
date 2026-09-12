'use client';
import { useState } from 'react';
import {
  Upload,
  FileText,
  Star,
  Check,
  ArrowUpRight,
  Pencil,
} from 'lucide-react';
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
import { checkImageFile } from '@/lib/client-upload';
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
        <button
          className="create-btn"
          disabled={!state.brands.length}
          onClick={() => setEditor('new')}
        >
          <Upload size={17} />
          Adicionar arquivo
        </button>
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
      <div className="category-summary">
        {assetCategories.map((c) => (
          <button
            key={c.value}
            className={category === c.value ? 'active' : ''}
            onClick={() => setCategory(category === c.value ? 'all' : c.value)}
          >
            {c.label}
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
      {items.length ? (
        <div className="asset-grid">
          {items.map((a) => (
            <article className="asset-card" key={a.id}>
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
      {editor && (
        <AssetEditor
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
function AssetEditor({
  state,
  asset,
  brandId,
  fixedBrand,
  close,
  saved,
  act,
}: {
  state: State;
  asset?: Asset;
  brandId: string;
  fixedBrand: boolean;
  close: () => void;
  saved: (brandId: string) => Promise<void>;
  act: Action;
}) {
  const [brand, setBrand] = useState(brandId);
  const [file, setFile] = useState<File | null>(null);
  const [value, setValue] = useState<AssetFieldsValue>(
    asset
      ? {
          name: asset.name,
          category: canonicalCategory(asset.category, asset.approved),
          description: asset.description,
          aiNotes: asset.aiNotes,
          priority: !!asset.priority,
        }
      : { ...emptyAssetFields },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <FormModal
      open
      onClose={() => {
        if (!busy) close();
      }}
      title={asset ? 'Detalhes do arquivo' : 'Adicionar arquivo'}
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
              if (!file) throw new Error('Selecione o arquivo.');
              await checkImageFile(file);
              const form = new FormData();
              form.set('file', file);
              form.set('brandId', brand);
              Object.entries(value).forEach(([k, v]) => form.set(k, String(v)));
              const response = await fetch('/api/assets', {
                method: 'POST',
                body: form,
              });
              const result = (await response.json()) as { error?: string };
              if (!response.ok) throw new Error(result.error);
            }
            await saved(brand);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
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
            <Field label="Arquivo">
              <Input
                type="file"
                required
                accept=".pdf,.svg,.png,.jpg,.jpeg,.webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setFile(f || null);
                  if (f && !value.name) setValue({ ...value, name: f.name });
                }}
              />
              <small className="muted">
                PDF, SVG, PNG, JPG e WEBP · até 20 MB
              </small>
            </Field>
          )}
          <AssetFields value={value} onChange={setValue} />
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
            onClick={close}
          >
            Cancelar
          </button>
          <button disabled={busy} className="create-btn">
            {busy
              ? 'Salvando…'
              : asset
                ? 'Salvar detalhes'
                : 'Adicionar à biblioteca'}
          </button>
        </div>
      </form>
    </FormModal>
  );
}
