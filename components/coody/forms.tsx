'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Picker } from './shared';
import { AttachmentPicker } from './attachments';
import { similarTopics } from '@/lib/domain';
import type { State, Content, Action } from '@/lib/types';
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function FormModal({
  title,
  description,
  open,
  onClose,
  children,
}: {
  title: string;
  description: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="coody-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function ContentForm({
  state,
  initial,
  date,
  brandId,
  onClose,
  onSaved,
  act,
}: {
  state: State;
  initial?: Content;
  date?: string;
  brandId?: string;
  onClose: () => void;
  onSaved?: (date: string) => void;
  act: Action;
}) {
  const [brand, setBrand] = useState(
    initial?.brandId || brandId || state.brands[0]?.id || '',
  );
  const [title, setTitle] = useState(initial?.title || '');
  const [brief, setBrief] = useState(initial?.brief || '');
  const [objective, setObjective] = useState(
    initial?.objective || 'Reconhecimento de marca',
  );
  const [format, setFormat] = useState(initial?.format || 'Feed + Story');
  const [day, setDay] = useState(initial?.date || date || '2026-09-15');
  const [pillar, setPillar] = useState(
    initial?.pillar ||
      state.brands.find((b) => b.id === brand)?.pillars[0]?.name ||
      '',
  );
  const [attachments, setAttachments] = useState<string[]>(
    initial?.attachments || [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = state.brands.find((b) => b.id === brand);
  const similar = similarTopics(
    title,
    state.contents.filter((c) => c.brandId === brand && c.id !== initial?.id),
  );
  return (
    <FormModal
      title={initial ? 'Editar pauta' : 'Criar conteúdo'}
      description="Comece pela ideia. O contexto da marca acompanha cada etapa."
      open
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            await act(initial ? 'editContent' : 'createContent', {
              id: initial?.id,
              brandId: brand,
              title,
              brief,
              objective,
              format,
              date: day,
              pillar,
              attachments,
            });
            onSaved?.(day);
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <Field label="Marca">
            {initial || brandId ? (
              <Input
                readOnly
                value={state.brands.find((b) => b.id === brand)?.name || ''}
              />
            ) : (
              <Picker
                label="Marca"
                value={brand}
                onChange={(v) => {
                  setBrand(v);
                  // Attachments belong to one brand's library.
                  setAttachments([]);
                  setPillar(
                    state.brands.find((b) => b.id === v)?.pillars[0]?.name ||
                      '',
                  );
                }}
                options={state.brands.map((b) => ({
                  value: b.id,
                  label: b.name,
                }))}
              />
            )}
          </Field>
          <Field label="Publicação prevista">
            <Input
              type="date"
              required
              value={day}
              onChange={(e) => setDay(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Tema / título provisório">
          <Input
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Qual ideia vamos colocar no mundo?"
          />
        </Field>
        {similar.length > 0 && (
          <p className="notice">
            Tema semelhante já existe: “{similar[0].title}”, em{' '}
            {similar[0].date}. Você pode continuar.
          </p>
        )}
        <Field label="Objetivo">
          <Input
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
          />
        </Field>
        <Field label="Briefing e informações adicionais">
          <Textarea
            rows={4}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="Mensagem, produto ou serviço, referências e observações."
          />
        </Field>
        <div className="form-grid">
          <Field label="Pilar">
            <Picker
              label="Pilar"
              value={pillar}
              onChange={setPillar}
              options={(selected?.pillars || []).map((p) => ({
                value: p.name,
                label: p.name,
              }))}
            />
          </Field>
          <Field label="Formatos">
            <Picker
              label="Formatos"
              value={format}
              onChange={setFormat}
              options={['Feed + Story', 'Feed', 'Story'].map((v) => ({
                value: v,
                label: v,
              }))}
            />
          </Field>
        </div>
        <p className="form-hint">
          Tom de voz: {selected?.voice || 'Ainda não definido'}
        </p>
        {brand && (
          <AttachmentPicker
            state={state}
            brandId={brand}
            value={attachments}
            onChange={setAttachments}
            disabled={busy}
          />
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="outline-btn" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="create-btn" disabled={busy}>
            {busy ? 'Salvando…' : initial ? 'Salvar pauta' : 'Criar conteúdo'}
          </button>
        </div>
      </form>
    </FormModal>
  );
}
