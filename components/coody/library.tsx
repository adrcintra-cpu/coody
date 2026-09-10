'use client';
import { useRef, useState } from 'react';
import { Upload, FileText, Star, Check, ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Picker, NoData } from './shared';
import type { State, Action } from '@/lib/types';
export const categories = [
  'Brandbook',
  'Logos',
  'Produtos',
  'Fotografias',
  'Campanhas',
  'Referências visuais',
  'Posts anteriores',
  'Artes aprovadas',
  'Materiais institucionais',
  'Outros',
];
export function LibraryView({
  state,
  act,
  reload,
  initialBrand,
}: {
  state: State;
  act: Action;
  reload: () => Promise<void>;
  initialBrand?: string;
}) {
  const [brand, setBrand] = useState(initialBrand || state.brands[0]?.id || '');
  const [category, setCategory] = useState('Todos');
  const [uploadCategory, setUploadCategory] = useState('Referências visuais');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const items = state.assets
    .filter(
      (a) =>
        a.brandId === brand &&
        (category === 'Todos' || a.category === category) &&
        a.name.toLowerCase().includes(query.toLowerCase()),
    )
    .sort(
      (a, b) => b.approved * 2 + b.priority - (a.approved * 2 + a.priority),
    );
  const toggle = async (id: string, priority: number, approved: number) => {
    try {
      await act('assetFlags', { id, priority, approved });
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">MEMÓRIA VISUAL</p>
          <h1>Biblioteca</h1>
          <p>Boas referências. Criações cada vez mais consistentes.</p>
        </div>
        <button
          disabled={busy || !brand}
          className="create-btn"
          onClick={() => input.current?.click()}
        >
          <Upload size={17} />
          {busy ? 'Enviando…' : 'Adicionar arquivo'}
        </button>
      </div>
      <div className="toolbar">
        <Picker
          label="Marca"
          value={brand}
          onChange={setBrand}
          options={state.brands.map((b) => ({ value: b.id, label: b.name }))}
        />
        <Picker
          label="Categoria"
          value={category}
          onChange={setCategory}
          options={['Todos', ...categories].map((c) => ({
            value: c,
            label: c,
          }))}
        />
        <Input
          aria-label="Buscar arquivo"
          placeholder="Buscar arquivo…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="upload-bar">
        <span>Salvar novos arquivos em</span>
        <Picker
          label="Categoria do upload"
          value={uploadCategory}
          onChange={setUploadCategory}
          options={categories.map((c) => ({ value: c, label: c }))}
        />
        <small>PDF, SVG, PNG, JPG e WEBP · até 20 MB</small>
      </div>
      <input
        ref={input}
        type="file"
        hidden
        accept=".pdf,.svg,.png,.jpg,.jpeg,.webp"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          setError('');
          try {
            const data = new FormData();
            data.set('file', file);
            data.set('brandId', brand);
            data.set('category', uploadCategory);
            const response = await fetch('/api/assets', {
              method: 'POST',
              body: data,
            });
            const result = (await response.json()) as { error?: string };
            if (!response.ok) throw new Error(result.error);
            await reload();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
            if (input.current) input.current.value = '';
          }
        }}
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
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
                <h3>{a.name}</h3>
                <p>{a.category}</p>
                <label htmlFor={a.id + '-priority'} className="check-label">
                  <Checkbox
                    id={a.id + '-priority'}
                    checked={!!a.priority}
                    onCheckedChange={(v) =>
                      void toggle(a.id, v ? 1 : 0, a.approved)
                    }
                  />
                  <Star size={13} /> Referência prioritária
                </label>
                <label htmlFor={a.id + '-approved'} className="check-label">
                  <Checkbox
                    id={a.id + '-approved'}
                    checked={!!a.approved}
                    onCheckedChange={(v) =>
                      void toggle(a.id, a.priority, v ? 1 : 0)
                    }
                  />
                  <Check size={13} /> Arte aprovada
                </label>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <NoData
          title="A memória desta marca começa aqui"
          description="Adicione brandbooks, logos e referências. Artes aprovadas terão prioridade no contexto de criação."
        />
      )}
    </>
  );
}
