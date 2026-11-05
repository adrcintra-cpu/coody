'use client';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Kanban, boardItem } from './kanban';
import { FormModal } from './forms';
import { displayDate, statusLabels, type Status } from '@/lib/types';
import { planApprovalOf } from '@/lib/domain';
import { PlanSheet, type PlanSheetPlan } from './plan-sheet';

type Item = {
  id: string;
  title: string;
  brief: string;
  pillar: string;
  date: string;
  format: string;
  status: Status;
  headline: string;
  copy: string;
  caption: string;
  hashtags: string[];
  feedUrl: string;
  storyUrl: string;
  media: { url: string; mime: string; name: string }[];
  comments: { text: string; createdAt: string; user: string }[];
};
type Board = {
  brand: { name: string; segment: string };
  month: string;
  plan: (PlanSheetPlan & { monthlyGoal?: number }) | null;
  items: Item[];
};
const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};
const monthName = (month: string) =>
  new Date(month + '-15T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

/** #cliente?token=… : the client's view of the board and the month plan. */
export function ClientBoard({ token }: { token: string }) {
  const [month, setMonth] = useState('');
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'quadro' | 'planejamento'>('quadro');
  const [openId, setOpenId] = useState('');
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('coody-client-name') || '';
    } catch {
      return '';
    }
  });
  const saveName = (value: string) => {
    setName(value);
    try {
      localStorage.setItem('coody-client-name', value);
    } catch {}
  };
  const load = useCallback(async () => {
    const r = await fetch(`/api/client?token=${encodeURIComponent(token)}${month ? '&month=' + month : ''}`, { cache: 'no-store' });
    const d = (await r.json()) as Board & { error?: string };
    if (!r.ok) throw new Error(d.error || 'Link indisponível.');
    setBoard(d);
    if (!month) setMonth(d.month);
  }, [token, month]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  const [done, setDone] = useState('');
  const decide = async (id: string, status: Status, comment: string) => {
    if (!name.trim()) throw new Error('Escreva seu nome para registrar a decisão.');
    const r = await fetch('/api/client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, id, status, comment, name }),
    });
    const d = (await r.json()) as { error?: string };
    if (!r.ok) throw new Error(d.error || 'Não foi possível registrar.');
    const title = board?.items.find((i) => i.id === id)?.title || 'A peça';
    setDone(
      status === 'APROVADO'
        ? `“${title}” aprovada. Obrigado! A agência já foi avisada.`
        : `Pedido enviado para “${title}”. A agência vai preparar uma nova versão e ela volta para você aprovar.`,
    );
    await load();
  };
  if (error)
    return (
      <main className="client-page">
        <div className="panel">
          <h1>Link indisponível</h1>
          <p>{error}</p>
        </div>
      </main>
    );
  if (!board)
    return (
      <main className="client-page">
        <p>Abrindo o quadro…</p>
      </main>
    );
  const item = board.items.find((i) => i.id === openId);
  const monthItems = board.items.filter((i) => i.date.startsWith(board.month));
  const approval = board.plan ? planApprovalOf(board.plan) : 'aprovado';
  // Until the month plan is approved, its pieces stay out of the board.
  const pending = board.items.filter((i) => i.status === 'APROVAÇÃO');
  const boardItems = board.items.filter(
    (i) => !(approval !== 'aprovado' && i.date.startsWith(board.month) && ['IDEIA', 'PLANEJADO'].includes(i.status)),
  );
  const decidePlan = async (status: 'aprovado' | 'ajustes', comment = '') => {
    const r = await fetch('/api/client', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, month: board.month, status, comment, name }),
    });
    const d = (await r.json()) as { error?: string };
    if (!r.ok) throw new Error(d.error || 'Não foi possível registrar.');
    await load();
  };
  return (
    <main className="client-page">
      <header className="client-header">
        <Image unoptimized width={469} height={172} src="/coody-logo.svg" alt="COODY" className="client-logo" />
        <div>
          <p className="eyebrow">{board.brand.segment || 'PRODUÇÃO'}</p>
          <h1>{board.brand.name}</h1>
        </div>
        <div className="client-month">
          <button className="outline-btn" aria-label="Mês anterior" onClick={() => setMonth(shiftMonth(board.month, -1))}>
            <ChevronLeft size={16} />
          </button>
          <strong>{monthName(board.month)}</strong>
          <button className="outline-btn" aria-label="Próximo mês" onClick={() => setMonth(shiftMonth(board.month, 1))}>
            <ChevronRight size={16} />
          </button>
        </div>
      </header>
      <nav className="client-tabs">
        <button className={tab === 'quadro' ? 'active' : ''} onClick={() => setTab('quadro')}>
          Quadro de produção
        </button>
        <button className={tab === 'planejamento' ? 'active' : ''} onClick={() => setTab('planejamento')}>
          Planejamento do mês{approval === 'enviado' ? ' · aprovar' : ''}
        </button>
        <label className="client-name">
          Seu nome
          <input
            value={name}
            maxLength={80}
            placeholder="Para registrar suas aprovações"
            onChange={(e) => {
              setName(e.target.value);
              try {
                localStorage.setItem('coody-client-name', e.target.value);
              } catch {}
            }}
          />
        </label>
      </nav>
      {tab === 'quadro' ? (
        <>
          {done && (
            <p className="notice success" role="status">
              {done}{' '}
              <button className="text-btn" onClick={() => setDone('')}>
                Fechar
              </button>
            </p>
          )}
          {pending.length > 0 && (
            <section className="client-pending">
              <h2>Para você aprovar · {pending.length}</h2>
              {pending.map((i) => (
                <button key={i.id} className="client-pending-row" onClick={() => setOpenId(i.id)}>
                  {i.feedUrl || i.media[0]?.mime.startsWith('image/') ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.feedUrl || i.media[0].url} alt="" loading="lazy" />
                  ) : (
                    <span className="client-pending-icon">
                      <FileText size={20} />
                    </span>
                  )}
                  <span>
                    <strong>{i.title}</strong>
                    <small className="muted">
                      {displayDate(i.date)} · {i.format}
                    </small>
                  </span>
                  <em>Abrir e decidir</em>
                </button>
              ))}
            </section>
          )}
          <p className="muted">
            Abra uma peça para aprovar ou pedir mudança. No computador, você também pode arrastar o card entre as
            colunas. Ajuste é um retoque na mesma arte; Alteração pede uma nova imagem.
          </p>
          {approval === 'enviado' && (
            <p className="notice">
              O planejamento deste mês está esperando sua aprovação.{' '}
              <button className="text-btn" onClick={() => setTab('planejamento')}>
                Ver planejamento
              </button>
            </p>
          )}
          <Kanban
            items={boardItems.map((i) => boardItem(i, board.brand.name, i))}
            mode="client"
            onOpen={setOpenId}
            onMove={decide}
          />
        </>
      ) : (
        <>
          <h2 className="client-plan-title">Planejamento de {monthName(board.month)}</h2>
          <PlanSheet
            brand={board.brand.name}
            month={board.month}
            items={monthItems}
            plan={board.plan}
            onOpen={setOpenId}
            actions={
              approval === 'enviado' ? (
                <PlanDecision decide={decidePlan} />
              ) : approval === 'ajustes' ? (
                <p className="form-hint">A agência está revisando o planejamento com as suas observações.</p>
              ) : null
            }
          />
        </>
      )}
      {item && (
        <PieceView item={item} close={() => setOpenId('')} decide={decide} name={name} setName={saveName} />
      )}
    </main>
  );
}

function PieceView({
  item,
  close,
  decide,
  name,
  setName,
}: {
  item: Item;
  close: () => void;
  decide: (id: string, status: Status, comment: string) => Promise<void>;
  name: string;
  setName: (v: string) => void;
}) {
  const [mode, setMode] = useState<'' | 'AJUSTE' | 'ALTERAÇÃO'>('');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const files = item.media.length
    ? item.media
    : [item.feedUrl && { url: item.feedUrl, mime: 'image/png', name: 'Feed · 4:5' }, item.storyUrl && { url: item.storyUrl, mime: 'image/png', name: 'Story · 9:16' }].filter(
        Boolean,
      ) as Item['media'];
  const send = async (status: Status) => {
    setBusy(true);
    setError('');
    try {
      await decide(item.id, status, comment);
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <FormModal open title={item.title} description={`${displayDate(item.date)} · ${item.format} · ${statusLabels[item.status]}`} onClose={() => !busy && close()}>
      <div className="client-media">
        {files.map((m, i) =>
          m.mime.startsWith('image/') ? (
            <figure key={i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={m.url} alt={m.name} loading="lazy" />
              {files.length > 1 && <figcaption>{m.name}</figcaption>}
            </figure>
          ) : m.mime.startsWith('video/') ? (
            <video key={i} src={m.url} controls playsInline preload="metadata" />
          ) : (
            <a key={i} className="outline-btn" href={m.url} target="_blank" rel="noreferrer">
              <FileText size={15} /> {m.name}
            </a>
          ),
        )}
        {!files.length && <p className="muted">A arte ainda está sendo criada.</p>}
      </div>
      {(item.headline || item.caption) && (
        <div className="client-copy">
          {item.headline && <strong>{item.headline}</strong>}
          {item.copy && <p>{item.copy}</p>}
          {item.caption && <p className="muted">{item.caption}</p>}
          {!!item.hashtags.length && <p className="muted">{item.hashtags.join(' ')}</p>}
        </div>
      )}
      {!!item.comments.length && (
        <div className="client-comments">
          {item.comments.slice(-5).map((c, i) => (
            <p key={i}>
              <small className="muted">{c.user}</small> {c.text}
            </p>
          ))}
        </div>
      )}
      {item.status === 'APROVAÇÃO' &&
        (mode ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(mode);
            }}
          >
            <Textarea
              autoFocus
              rows={3}
              placeholder={mode === 'AJUSTE' ? 'O que ajustar na mesma arte?' : 'O que precisa mudar na imagem?'}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="form-actions">
              <button type="button" className="outline-btn" disabled={busy} onClick={() => setMode('')}>
                Voltar
              </button>
              <button className="create-btn" disabled={busy || !comment.trim()}>
                {busy ? 'Enviando…' : mode === 'AJUSTE' ? 'Pedir ajuste' : 'Pedir alteração'}
              </button>
            </div>
          </form>
        ) : (
          <div className="client-decision">
            {!name.trim() && (
              <label className="client-name-inline">
                Seu nome (fica registrado na decisão)
                <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
              </label>
            )}
            <button className="create-btn" disabled={busy || !name.trim()} onClick={() => void send('APROVADO')}>
              {busy ? 'Aprovando…' : 'Aprovar'}
            </button>
            <button className="outline-btn" disabled={busy || !name.trim()} onClick={() => setMode('AJUSTE')}>
              Pedir ajuste <small>retoque na mesma arte</small>
            </button>
            <button className="outline-btn" disabled={busy || !name.trim()} onClick={() => setMode('ALTERAÇÃO')}>
              Pedir alteração <small>uma nova imagem</small>
            </button>
          </div>
        ))}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </FormModal>
  );
}

function PlanDecision({ decide }: { decide: (status: 'aprovado' | 'ajustes', comment?: string) => Promise<void> }) {
  const [asking, setAsking] = useState(false);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const send = async (status: 'aprovado' | 'ajustes') => {
    setBusy(true);
    setError('');
    try {
      await decide(status, comment);
      setAsking(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="plan-decision">
      <p className="form-hint">
        Confira as datas e os temas. Ao aprovar, as publicações entram na produção com estas datas.
      </p>
      {asking ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send('ajustes');
          }}
        >
          <Textarea
            autoFocus
            rows={3}
            maxLength={2000}
            placeholder="O que mudar? Datas, temas, formatos…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="form-actions">
            <button type="button" className="outline-btn" disabled={busy} onClick={() => setAsking(false)}>
              Voltar
            </button>
            <button className="create-btn" disabled={busy || !comment.trim()}>
              {busy ? 'Enviando…' : 'Enviar pedido'}
            </button>
          </div>
        </form>
      ) : (
        <div className="form-actions">
          <button className="outline-btn" disabled={busy} onClick={() => setAsking(true)}>
            Pedir mudanças
          </button>
          <button className="create-btn" disabled={busy} onClick={() => void send('aprovado')}>
            {busy ? 'Aprovando…' : 'Aprovar planejamento'}
          </button>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
