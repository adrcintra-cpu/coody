'use client';
import { useRef, useState } from 'react';
import { Check, ImagePlus, LoaderCircle, X } from 'lucide-react';
import { can } from '@/lib/permissions';
import { checkImageFile, fitUpload } from '@/lib/client-upload';
import { assetLimitMB } from '@/lib/upload-limits';
import { MAX_ATTACHMENTS, isAttachable } from '@/lib/creative-materials';
import type { Asset, State } from '@/lib/types';

type Thumb = Pick<Asset, 'id' | 'name' | 'url' | 'category'>;

/**
 * Product photos (or other library images) attached to one piece. The image
 * model receives these files as the products of the piece. New files are
 * uploaded to the brand Library under Produtos and attached right away.
 */
export function AttachmentPicker({
  state,
  brandId,
  value,
  onChange,
  disabled,
  onUploaded,
}: {
  state: State;
  brandId: string;
  value: string[];
  onChange: (ids: string[]) => void | Promise<void>;
  disabled?: boolean;
  onUploaded?: () => Promise<void>;
}) {
  const [uploaded, setUploaded] = useState<Thumb[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  // Deleting an image from the brand Library, right from this panel.
  const canDelete = can(state.user?.role, 'edit') && !disabled;
  const [confirmId, setConfirmId] = useState('');
  const [deleted, setDeleted] = useState<string[]>([]);
  const removeImage = async (id: string) => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/assets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
      const d = (await r.json()) as {
        removed?: string[];
        kept?: { name: string; reason: string }[];
        error?: string;
      };
      if (!r.ok) throw new Error(d.error || 'Não foi possível excluir.');
      if (d.kept?.length)
        throw new Error(`Não foi excluída: ${d.kept[0].reason}.`);
      setDeleted((old) => [...old, id]);
      setUploaded((old) => old.filter((u) => u.id !== id));
      if (value.includes(id)) await onChange(value.filter((x) => x !== id));
      await onUploaded?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setConfirmId('');
    }
  };
  const input = useRef<HTMLInputElement>(null);
  const library: Thumb[] = state.assets.filter(
    (a) => isAttachable(a, brandId) && !deleted.includes(a.id),
  );
  // Files uploaded here appear before the workspace reloads.
  const all = [
    ...uploaded.filter((u) => !library.some((a) => a.id === u.id)),
    ...library,
  ];
  const products = all.filter((a) => a.category === 'product_photo');
  const others = all.filter((a) => a.category !== 'product_photo');
  const shown = [
    // Selected files always stay visible, then products, then the rest.
    ...all.filter((a) => value.includes(a.id)),
    ...products.filter((a) => !value.includes(a.id)),
    ...(showAll ? others.filter((a) => !value.includes(a.id)) : []),
  ];
  const full = value.length >= MAX_ATTACHMENTS;
  const toggle = async (id: string) => {
    setError('');
    try {
      await onChange(
        value.includes(id) ? value.filter((x) => x !== id) : [...value, id],
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="attachments">
      <div className="attachments-head">
        <span>
          Produtos e arquivos desta peça · {value.length}/{MAX_ATTACHMENTS}
        </span>
        <button
          type="button"
          className="outline-btn"
          disabled={disabled || busy || full || !brandId}
          onClick={() => input.current?.click()}
        >
          {busy ? (
            <LoaderCircle size={15} className="animate-spin" />
          ) : (
            <ImagePlus size={15} />
          )}
          {busy ? 'Enviando…' : 'Enviar foto'}
        </button>
        <input
          ref={input}
          type="file"
          hidden
          accept="image/png,image/jpeg,image/webp"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setBusy(true);
            setError('');
            try {
              const fitted = await fitUpload(file, assetLimitMB);
              await checkImageFile(fitted);
              const form = new FormData();
              form.set('file', fitted);
              form.set('brandId', brandId);
              form.set('name', file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 200));
              form.set('category', 'product_photo');
              form.set('description', 'Enviado como produto de uma pauta.');
              form.set('aiNotes', 'Produto real: reproduzir com fidelidade.');
              form.set('priority', 'false');
              const response = await fetch('/api/assets', {
                method: 'POST',
                body: form,
              });
              const result = (await response.json()) as {
                id?: string;
                error?: string;
              };
              if (!response.ok || !result.id)
                throw new Error(result.error || 'Falha no envio.');
              setUploaded((old) => [
                ...old,
                {
                  id: result.id!,
                  name: file.name,
                  url: '/api/assets/' + result.id,
                  category: 'product_photo',
                },
              ]);
              await onUploaded?.();
              await onChange([...value, result.id]);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </div>
      <p className="form-hint">
        A IA usa estes arquivos como os produtos da arte, junto com o logo e o
        manual da marca. Sem anexos, ela usa a biblioteca inteira. Fotos
        enviadas aqui ficam salvas em Biblioteca › Produtos.
      </p>
      {shown.length ? (
        <div className="attachment-grid">
          {shown.map((a) => {
            const on = value.includes(a.id);
            return (
              <div className="attachment-cell" key={a.id}>
                <button
                  type="button"
                  className={'attachment' + (on ? ' selected' : '')}
                  aria-pressed={on}
                  title={a.name}
                  disabled={disabled || busy || (!on && full)}
                  onClick={() => toggle(a.id)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.url} alt="" loading="lazy" />
                  <span>{a.name}</span>
                  {on && (
                    <i aria-hidden>
                      <Check size={13} />
                    </i>
                  )}
                </button>
                {canDelete && (
                  <button
                    type="button"
                    className="attachment-delete"
                    aria-label={'Excluir ' + a.name + ' da biblioteca'}
                    title="Excluir da biblioteca"
                    disabled={busy}
                    onClick={() => setConfirmId(a.id)}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted">
          Nenhuma foto de produto na biblioteca desta marca. Use “Enviar foto”.
        </p>
      )}
      {confirmId && (
        <div className="notice attachment-confirm" role="alertdialog">
          <span>
            Excluir “{all.find((a) => a.id === confirmId)?.name || 'imagem'}” da
            biblioteca da marca? A imagem some de todas as pautas e não pode
            ser recuperada.
          </span>
          <div>
            <button
              type="button"
              className="outline-btn"
              disabled={busy}
              onClick={() => setConfirmId('')}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="create-btn danger-btn"
              disabled={busy}
              onClick={() => void removeImage(confirmId)}
            >
              {busy ? 'Excluindo…' : 'Excluir'}
            </button>
          </div>
        </div>
      )}
      {others.some((a) => !value.includes(a.id)) && (
        <button
          type="button"
          className="text-btn"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll
            ? 'Mostrar só produtos'
            : `Mostrar outras imagens da biblioteca (${others.filter((a) => !value.includes(a.id)).length})`}
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
