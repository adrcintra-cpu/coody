'use client';
import { useEffect, useMemo, useState } from 'react';
import { Copy, Link2, MessageCircle, Send, Upload } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FormModal } from './forms';
import { Picker } from './shared';
import { Kanban, boardItem } from './kanban';
import { directUpload } from '@/lib/client-upload';
import { can } from '@/lib/permissions';
import { heldByPlan, planApprovalOf } from '@/lib/domain';
import { formats, today, type Action, type State, type Status } from '@/lib/types';

/**
 * Produção: the production board of every brand (or one), with the client
 * link and the upload of pieces made outside the COODY for approval.
 */
export function Production({
  state,
  month,
  act,
  open,
}: {
  state: State;
  month: string;
  act: Action;
  open: (id: string) => void;
}) {
  const [brandId, setBrandId] = useState('all');
  const [allMonths, setAllMonths] = useState(false);
  const [sending, setSending] = useState(false);
  const [sharing, setSharing] = useState(false);
  const role = state.user?.role;
  const brandName = (id: string) => state.brands.find((b) => b.id === id)?.name || '';
  const items = useMemo(
    () =>
      state.contents
        .filter(
          (c) =>
            (brandId === 'all' || c.brandId === brandId) &&
            // Planned pieces wait for the client to approve the month plan.
            !heldByPlan(c, state.plans) &&
            (allMonths ||
              c.date.startsWith(month) ||
              // Pending decisions always show up, whatever the month.
              ['APROVAÇÃO', 'AJUSTE', 'ALTERAÇÃO'].includes(c.status)),
        )
        .map((c) => {
          const v = state.versions
            .filter((x) => x.contentId === c.id)
            .sort((a, b) => b.number - a.number)[0];
          return boardItem(c, brandName(c.brandId), v);
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, brandId, allMonths, month],
  );
  // Month plans not approved yet, with the pieces they hold back.
  const waiting = state.plans
    .filter(
      (p) =>
        (brandId === 'all' || p.brandId === brandId) &&
        planApprovalOf(p) !== 'aprovado' &&
        (allMonths || p.month >= month.slice(0, 7)),
    )
    .map((p) => ({
      plan: p,
      count: state.contents.filter((c) => heldByPlan(c, [p])).length,
    }))
    .filter((w) => w.count);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PRODUÇÃO</p>
          <h1>Quadro de produção</h1>
          <p>Arraste os cards entre as colunas ou abra a peça.</p>
        </div>
        <div className="brand-actions">
          {can(role, 'edit') && (
            <>
              <button className="outline-btn" onClick={() => setSharing(true)}>
                <Link2 size={16} /> Área do cliente
              </button>
              <button className="create-btn" onClick={() => setSending(true)}>
                <Upload size={16} /> Enviar peça para aprovação
              </button>
            </>
          )}
        </div>
      </div>
      <div className="toolbar">
        <Picker
          label="Marca"
          value={brandId}
          onChange={setBrandId}
          options={[
            { value: 'all', label: 'Todas as marcas' },
            ...state.brands.map((b) => ({ value: b.id, label: b.name })),
          ]}
        />
        <label className="check-label">
          <input type="checkbox" checked={allMonths} onChange={(e) => setAllMonths(e.target.checked)} />
          Todos os meses
        </label>
      </div>
      {waiting.length > 0 && (
        <div className="notice plan-waiting">
          <strong>Planejamentos aguardando o cliente</strong>
          {waiting.map(({ plan, count }) => (
            <span key={plan.id}>
              {brandName(plan.brandId)} ·{' '}
              {new Date(plan.month + '-15T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} ·{' '}
              {count} pauta(s) ·{' '}
              {planApprovalOf(plan) === 'rascunho'
                ? 'ainda não enviado'
                : planApprovalOf(plan) === 'ajustes'
                  ? 'cliente pediu mudanças'
                  : 'enviado'}
            </span>
          ))}
          <small>As pautas entram no quadro quando o planejamento do mês for aprovado.</small>
        </div>
      )}
      <Kanban
        items={items}
        mode="team"
        canDecide={can(role, 'approve')}
        onOpen={open}
        onMove={async (id, status: Status, comment) => {
          const c = state.contents.find((x) => x.id === id);
          await act('status', { id, status, comment, expectedRevision: c?.revision ?? 0 });
        }}
      />
      {sending && (
        <ExternalPiece
          state={state}
          brandId={brandId === 'all' ? '' : brandId}
          act={act}
          close={() => setSending(false)}
        />
      )}
      {sharing && (
        <ClientLink state={state} brandId={brandId === 'all' ? '' : brandId} close={() => setSharing(false)} />
      )}
    </>
  );
}

/** A post, carousel, video or file made outside the COODY, for approval. */
export function ExternalPiece({
  state,
  brandId,
  act,
  close,
  contentId,
}: {
  state: State;
  brandId: string;
  act: Action;
  close: () => void;
  /** New version of an existing piece (after ajuste/alteração). */
  contentId?: string;
}) {
  const piece = contentId ? state.contents.find((c) => c.id === contentId) : undefined;
  const [brand, setBrand] = useState(piece?.brandId || brandId || state.brands[0]?.id || '');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today());
  const [format, setFormat] = useState('');
  const [caption, setCaption] = useState('');
  const [change, setChange] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const guess =
    files.length > 1 ? 'Carrossel' : files[0]?.type.startsWith('video/') ? 'Vídeo' : files[0]?.type.startsWith('image/') ? 'Feed' : files[0] ? 'Arquivo' : '';
  return (
    <FormModal
      open
      title={piece ? 'Enviar nova versão' : 'Enviar peça para aprovação'}
      description={
        piece
          ? 'Os novos arquivos viram a próxima versão da peça.'
          : 'Post, carrossel, vídeo ou arquivo feito fora do COODY. A peça entra direto em "Para aprovação".'
      }
      onClose={() => !busy && close()}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          try {
            if (!files.length) throw new Error('Escolha os arquivos.');
            const ids: string[] = [];
            for (let i = 0; i < files.length; i++) {
              const f = files[i];
              const asset = await directUpload(f, brand, { name: f.name, category: 'delivery' }, (p) =>
                setProgress(`Enviando ${i + 1} de ${files.length} · ${p}%`),
              );
              ids.push(asset.id);
            }
            setProgress('Salvando a peça…');
            if (piece) await act('mediaVersion', { id: piece.id, media: ids, change: change || 'Nova versão enviada' });
            else
              await act('createExternal', {
                brandId: brand,
                title,
                date,
                format: format || guess,
                caption,
                media: ids,
              });
            close();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
            setProgress('');
          }
        }}
      >
        <fieldset disabled={busy} className="onboarding-fields">
          {!piece && (
            <>
              <div className="form-grid">
                <Field label="Marca">
                  <Picker
                    label="Marca"
                    value={brand}
                    onChange={setBrand}
                    options={state.brands.map((b) => ({ value: b.id, label: b.name }))}
                  />
                </Field>
                <Field label="Publicação prevista">
                  <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
              </div>
              <Field label="Título">
                <Input required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
              </Field>
              <Field label="Formato">
                <Picker
                  label="Formato"
                  value={format || guess}
                  onChange={setFormat}
                  options={formats.map((f) => ({ value: f, label: f === 'Feed' ? 'Post (Feed)' : f }))}
                />
              </Field>
              <Field label="Legenda (opcional)">
                <Textarea rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} />
              </Field>
            </>
          )}
          {piece && (
            <Field label="O que mudou (opcional)">
              <Input value={change} maxLength={300} onChange={(e) => setChange(e.target.value)} />
            </Field>
          )}
          <Field label="Arquivos (imagens, vídeo ou PDF · até 20)">
            <Input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/webm,application/pdf"
              onChange={(e) => {
                const list = Array.from(e.target.files || []) as File[];
                if (list.length > 20) {
                  setError('Envie até 20 arquivos.');
                  return;
                }
                setFiles(list);
              }}
            />
          </Field>
          {!!files.length && (
            <ul className="upload-list">
              {files.map((f, i) => (
                <li key={i}>
                  <span className="upload-icon">{f.type.split('/')[0].toUpperCase().slice(0, 5)}</span>
                  <div>
                    <strong>{i + 1}. {f.name}</strong>
                    <small className="muted">{(f.size / 1024 / 1024).toFixed(1)} MB</small>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {files.length > 1 && <p className="form-hint">A ordem dos arquivos é a ordem das lâminas do carrossel.</p>}
        </fieldset>
        {progress && <p className="form-hint">{progress}</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="outline-btn" disabled={busy} onClick={close}>
            Cancelar
          </button>
          <button className="create-btn" disabled={busy || !files.length || (!piece && (!title.trim() || !brand))}>
            <Send size={15} /> {busy ? 'Enviando…' : piece ? 'Enviar versão' : 'Enviar para aprovação'}
          </button>
        </div>
      </form>
    </FormModal>
  );
}

/** The client link of a brand: create, copy, send by WhatsApp, revoke. */
export function ClientLink({ state, brandId, close }: { state: State; brandId: string; close: () => void }) {
  const [brand, setBrand] = useState(brandId || state.brands[0]?.id || '');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!brand) return;
    setLink('');
    fetch('/api/share?brandId=' + encodeURIComponent(brand), { cache: 'no-store' })
      .then((r) => r.json())
      .then((d: { link?: string; error?: string }) => (d.error ? setError(d.error) : setLink(d.link || '')))
      .catch(() => setError('Não foi possível carregar o link.'));
  }, [brand]);
  const post = async (action: 'create' | 'revoke') => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const r = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, brandId: brand }),
      });
      const d = (await r.json()) as { link?: string; error?: string };
      if (!r.ok) throw new Error(d.error);
      setLink(d.link || '');
      setMessage(action === 'revoke' ? 'Link desativado. Quem tinha o link perde o acesso.' : 'Link criado.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const name = state.brands.find((b) => b.id === brand)?.name || '';
  const whatsapp =
    'https://wa.me/?text=' +
    encodeURIComponent(
      `Olá! Esta é a área da ${name} no COODY: você vê o planejamento do mês e as peças, e pode aprovar ou pedir ajustes por aqui: ${link}`,
    );
  return (
    <FormModal
      open
      title="Área do cliente"
      description="Página pública e exclusiva desta marca: o cliente abre sem login, vê o planejamento e o quadro, e aprova ou pede ajuste/alteração."
      onClose={close}
    >
      <Field label="Marca">
        <Picker
          label="Marca"
          value={brand}
          onChange={setBrand}
          options={state.brands.map((b) => ({ value: b.id, label: b.name }))}
        />
      </Field>
      {link ? (
        <>
          <div className="invite-link-row">
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="outline-btn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setMessage('Link copiado.');
                } catch {
                  setMessage('Selecione o link e copie com Cmd+C.');
                }
              }}
            >
              <Copy size={15} /> Copiar
            </button>
          </div>
          <div className="form-actions">
            <button type="button" className="text-btn danger" disabled={busy} onClick={() => void post('revoke')}>
              Desativar link
            </button>
            <button type="button" className="outline-btn" disabled={busy} onClick={() => void post('create')}>
              Gerar novo link
            </button>
            <a className="create-btn" href={whatsapp} target="_blank" rel="noreferrer">
              <MessageCircle size={15} /> Enviar pelo WhatsApp
            </a>
          </div>
        </>
      ) : (
        <div className="form-actions">
          <button type="button" className="create-btn" disabled={busy || !brand} onClick={() => void post('create')}>
            <Link2 size={15} /> Criar área do cliente
          </button>
        </div>
      )}
      {message && <p className="form-hint">{message}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </FormModal>
  );
}
