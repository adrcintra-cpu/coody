'use client';
import { useState } from 'react';
import { FileText, Images, PlayCircle } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { FormModal, Field } from './forms';
import {
  clientDrop,
  columnOf,
  columns,
  dropStatus,
  needsComment,
  type ColumnId,
} from '@/lib/domain';
import { displayDate, statusLabels, type Status } from '@/lib/types';

export type BoardItem = {
  id: string;
  title: string;
  brand: string;
  date: string;
  format: string;
  status: Status;
  thumb: string;
  kind: 'image' | 'carousel' | 'video' | 'file' | 'none';
};

/**
 * The production board, shared by the team (any allowed move) and the client
 * link (only decides on pieces waiting for approval). Cards can be dragged
 * between columns or opened; Ajuste and Alteração ask what should change.
 */
export function Kanban({
  items,
  mode,
  onOpen,
  onMove,
  hiddenColumns = [],
  canDecide = true,
}: {
  items: BoardItem[];
  mode: 'team' | 'client';
  onOpen: (id: string) => void;
  onMove: (id: string, status: Status, comment: string) => Promise<void>;
  hiddenColumns?: ColumnId[];
  /** Shows Aprovar / Ajuste / Alteração on cards waiting for approval. */
  canDecide?: boolean;
}) {
  const [dragging, setDragging] = useState('');
  const [over, setOver] = useState<ColumnId | ''>('');
  const [pending, setPending] = useState<{ id: string; status: Status } | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const target = (column: ColumnId, current: Status) =>
    mode === 'client' ? clientDrop(column, current) : dropStatus(column, current);
  const move = async (id: string, status: Status, text = '') => {
    if (needsComment(status) && !text.trim()) {
      setComment('');
      setPending({ id, status });
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onMove(id, status, text);
      setPending(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const draggingItem = items.find((i) => i.id === dragging);
  return (
    <>
      {error && (
        <p className="notice error" role="alert">
          {error}{' '}
          <button className="text-btn" onClick={() => setError('')}>
            Fechar
          </button>
        </p>
      )}
      <div className="kanban" aria-busy={busy}>
        {columns
          .filter((c) => !hiddenColumns.includes(c.id))
          .map((column) => {
            const cards = items
              .filter((i) => columnOf(i.status) === column.id)
              .sort((a, b) => a.date.localeCompare(b.date));
            const allowed = !!draggingItem && !!target(column.id, draggingItem.status);
            return (
              <section
                key={column.id}
                className={
                  'kanban-column ' +
                  column.id +
                  (dragging ? (allowed ? ' can-drop' : ' no-drop') : '') +
                  (over === column.id && allowed ? ' over' : '')
                }
                onDragOver={(e) => {
                  if (!allowed) return;
                  e.preventDefault();
                  setOver(column.id);
                }}
                onDragLeave={() => setOver('')}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver('');
                  const id = e.dataTransfer.getData('text/plain') || dragging;
                  const item = items.find((i) => i.id === id);
                  setDragging('');
                  const status = item && target(column.id, item.status);
                  if (item && status) void move(item.id, status);
                }}
              >
                <header>
                  <h2>
                    {column.title} <span>{cards.length}</span>
                  </h2>
                  <small>{column.hint}</small>
                </header>
                <div className="kanban-cards">
                  {cards.map((card) => (
                    <article
                      key={card.id}
                      className={'kanban-card' + (dragging === card.id ? ' dragging' : '')}
                      draggable={mode === 'team' || (card.status === 'APROVAÇÃO' && canDecide)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', card.id);
                        e.dataTransfer.effectAllowed = 'move';
                        setDragging(card.id);
                      }}
                      onDragEnd={() => {
                        setDragging('');
                        setOver('');
                      }}
                    >
                      <button
                        type="button"
                        className="kanban-open"
                        onClick={() => onOpen(card.id)}
                        aria-label={'Abrir ' + card.title}
                      >
                        <span className="kanban-thumb">
                          {card.thumb ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={card.thumb} alt="" loading="lazy" />
                          ) : card.kind === 'video' ? (
                            <PlayCircle size={28} />
                          ) : (
                            <FileText size={26} />
                          )}
                          {card.kind === 'carousel' && (
                            <i title="Carrossel">
                              <Images size={13} />
                            </i>
                          )}
                          {card.kind === 'video' && card.thumb && (
                            <i title="Vídeo">
                              <PlayCircle size={13} />
                            </i>
                          )}
                        </span>
                        <span className="kanban-text">
                          <strong>{card.title}</strong>
                          <small>
                            {card.brand} · {displayDate(card.date)} · {card.format}
                          </small>
                          {column.id === 'criacao' || column.id === 'fila' ? (
                            <small className="muted">{statusLabels[card.status]}</small>
                          ) : null}
                        </span>
                      </button>
                      {card.status === 'APROVAÇÃO' && canDecide && (
                        <div className="kanban-actions">
                          <button className="create-btn" disabled={busy} onClick={() => void move(card.id, 'APROVADO')}>
                            Aprovar
                          </button>
                          <button className="outline-btn" disabled={busy} onClick={() => void move(card.id, 'AJUSTE')}>
                            Ajuste
                          </button>
                          <button className="outline-btn" disabled={busy} onClick={() => void move(card.id, 'ALTERAÇÃO')}>
                            Alteração
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                  {!cards.length && <p className="kanban-empty">Nada aqui.</p>}
                </div>
              </section>
            );
          })}
      </div>
      {pending && (
        <FormModal
          open
          title={pending.status === 'AJUSTE' ? 'Pedir ajuste' : 'Pedir alteração'}
          description={
            pending.status === 'AJUSTE'
              ? 'Ajuste fino na mesma arte: texto, cor, posição, detalhe.'
              : 'Uma nova imagem: outra composição, foto ou ideia visual.'
          }
          onClose={() => !busy && setPending(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void move(pending.id, pending.status, comment);
            }}
          >
            <Field label={pending.status === 'AJUSTE' ? 'O que ajustar?' : 'O que precisa mudar?'}>
              <Textarea
                autoFocus
                rows={4}
                maxLength={2000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </Field>
            <div className="form-actions">
              <button type="button" className="outline-btn" disabled={busy} onClick={() => setPending(null)}>
                Cancelar
              </button>
              <button className="create-btn" disabled={busy || !comment.trim()}>
                {busy ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </form>
        </FormModal>
      )}
    </>
  );
}

/** Card data from a piece and its latest version. */
export function boardItem(
  c: { id: string; title: string; date: string; format: string; status: Status },
  brand: string,
  version?: { feedUrl: string; media?: { url: string; mime: string }[] },
): BoardItem {
  const media = version?.media || [];
  const firstImage = media.find((m) => m.mime.startsWith('image/'))?.url || version?.feedUrl || '';
  const kind: BoardItem['kind'] = media.length > 1
    ? 'carousel'
    : media[0]?.mime.startsWith('video/')
      ? 'video'
      : media[0] && !media[0].mime.startsWith('image/')
        ? 'file'
        : firstImage
          ? 'image'
          : 'none';
  return { id: c.id, title: c.title, brand, date: c.date, format: c.format, status: c.status, thumb: firstImage, kind };
}
