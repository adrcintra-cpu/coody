'use client';
import { useState, useEffect } from 'react';
import type { State, Content } from '@/lib/types';
import { IntegrationMissing, useIntegrationStatus } from './integration-status';
type Job = { id: string; status: string; message: string; format: string };
export function MagnificIntegration() {
  const status = useIntegrationStatus('/api/magnific');
  return (
    <section className="panel">
      <h2>Magnific · novas artes</h2>
      <output aria-live="polite">{status.message}</output>
      {status.checkedAt && !status.checking && (
        <p className="form-hint">
          Verificado às{' '}
          {status.checkedAt.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </p>
      )}
      <p>
        Gere a arte-base no Studio; o Story é recomposto em 9:16 a partir dela, no Studio. Os resultados são salvos para revisão. As APIs usam créditos
        separados das assinaturas dos aplicativos.
      </p>
      <button
        className="outline-btn"
        disabled={status.checking}
        onClick={() => void status.check()}
      >
        {status.checking ? 'Verificando…' : 'Verificar conexão'}
      </button>
    </section>
  );
}
export function MagnificGenerator({
  state,
  item,
  disabled,
  reload,
}: {
  state: State;
  item: Content;
  disabled: boolean;
  reload: () => Promise<void>;
}) {
  const [correction,setCorrection] = useState('');
  const latest = state.versions.filter(v=>v.contentId===item.id).sort((a,b)=>b.number-a.number)[0];
  const lastComment = state.comments.filter(c=>c.contentId===item.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  const status = useIntegrationStatus('/api/magnific');
  const unavailable = status.configured === false;
  // One source art per piece: generated in the Feed format when the piece has
  // a Feed; the Story is adapted from it automatically in the Studio.
  const format = item.format.includes('Feed') ? 'Feed' : 'Story';
  const [prompt, setPrompt] = useState(''),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [jobs, setJobs] = useState<Job[]>([]);
  const refs = state.assets.filter(
    (a) =>
      a.brandId === item.brandId &&
      ['image/png', 'image/jpeg', 'image/webp'].includes(a.mime),
  );
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const r = await fetch('/api/magnific?contentId=' + item.id);
        const data = (await r.json()) as { jobs?: Job[] };
        if (!active) return;
        setJobs(data.jobs || []);
        for (const job of data.jobs || []) {
          if (job.status !== 'pending') continue;
          const response = await fetch('/api/magnific', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'sync', jobId: job.id }),
          });
          const updated = (await response.json()) as {
            job?: Job;
            error?: string;
          };
          if (!active) return;
          if (updated.error) setMessage(updated.error);
          if (updated.job) {
            setJobs((old) =>
              old.map((j) => (j.id === job.id ? updated.job! : j)),
            );
            if (updated.job.status === 'complete') {
              setMessage(updated.job.message);
              await reload();
            }
          }
        }
      } catch {
        if (active)
          setMessage(
            'Não foi possível consultar a geração. Atualize o pedido.',
          );
      }
    }
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [item.id, reload]);
  async function generate(revise = false) {
    setBusy(true);
    setMessage('Enviando pedido…');
    try {
      const r = await fetch('/api/magnific', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentId: item.id,
          format,
          prompt: revise ? correction : prompt,
          action: revise ? 'revise' : 'generate',
          baseVersionId: latest?.id,
          expectedRevision: item.revision || 0,
          assetIds: selected,
        }),
      });
      const d = (await r.json()) as { error?: string; jobId?: string };
      if (!r.ok) throw new Error(d.error);
      setJobs((old) => [
        { id: d.jobId!, status: 'pending', format, message: '' },
        ...old,
      ]);
      setMessage(
        'Pedido recebido. O resultado será salvo na Biblioteca e aplicado ao Studio se a pauta não mudar.',
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Falha ao gerar.');
    } finally {
      setBusy(false);
    }
  }
  const pending = jobs.some((j) =>
    ['pending', 'submitting', 'unknown'].includes(j.status),
  );
  return (
    <section className="panel section-space">
      <h2>Gerar arte com Magnific</h2>
      <p>
        Use imagens reais da marca para criar uma nova composição. Os textos
        atuais da pauta são preservados.
      </p>
      {unavailable && <IntegrationMissing name="Magnific" />}
      <p className="form-hint">
        Formato da arte: {format === 'Feed' ? 'Feed 1080 × 1350' : 'Story 1080 × 1920'}.
        {item.format.includes('Feed') && item.format.includes('Story')
          ? ' O Story é recomposto em 9:16 a partir desta arte, no Studio.'
          : ''}
      </p>
      <label className="field">
        Descreva o criativo
        <textarea
          className="workspace-input"
          disabled={unavailable}
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Tema, composição, texto que deve aparecer e produto em destaque"
        />
      </label>
      <fieldset className="magnific-references">
        <legend>Referências da Biblioteca · {selected.length}/4</legend>
        {refs.length ? (
          refs.map((a) => (
            <label key={a.id}>
              <input
                type="checkbox"
                checked={selected.includes(a.id)}
                disabled={!selected.includes(a.id) && selected.length === 4}
                onChange={(e) =>
                  setSelected((old) =>
                    e.target.checked
                      ? [...old, a.id]
                      : old.filter((id) => id !== a.id),
                  )
                }
              />
              {a.name}
            </label>
          ))
        ) : (
          <p>Adicione logotipos e fotos de produtos na Biblioteca.</p>
        )}
      </fieldset>
      <p className="form-hint">
        PNG, JPG e WEBP. PDFs e SVGs não são enviados a este modelo; use as
        regras cadastradas na marca. Cada geração pode consumir créditos
        Magnific.
      </p>
      <button
        className="primary-btn"
        disabled={disabled || busy || pending || unavailable || status.checking || !prompt.trim()}
        onClick={() => void generate()}
      >
        {busy
          ? 'Enviando…'
          : pending
            ? 'Geração em andamento'
            : 'Gerar arte · ' + format}
      </button>
      {message && !correction && (
        <output aria-live="polite" className="form-hint">
          {message}
        </output>
      )}
      {latest?.[format === 'Feed' ? 'feedUrl' : 'storyUrl'] && <div className="art-correction">
        <h3>Corrigir a arte atual · {format}</h3>
        <p>A imagem da versão V{latest.number} será usada como base. A correção será salva em uma nova versão para revisão.</p>
        <label className="field">Alterações necessárias<textarea className="workspace-input" disabled={unavailable} rows={3} value={correction} onChange={e=>setCorrection(e.target.value)} placeholder="Ex.: corrigir o texto, aumentar o logotipo e manter o restante da arte"/></label>
        {lastComment && <button className="text-btn" onClick={()=>setCorrection(lastComment.text)}>Usar último comentário</button>}
        {selected.length>3&&<p className="notice">Para corrigir, selecione até três referências. A arte atual ocupa a primeira posição.</p>}
        <button className="primary-btn" disabled={disabled||busy||pending||unavailable||status.checking||!correction.trim()||selected.length>3} onClick={()=>void generate(true)}>Aplicar alterações com IA</button>
        {message && correction && <output aria-live="polite" className="form-hint">{message}</output>}
        <p className="form-hint">Usa Magnific e pode consumir créditos. A fase muda para revisão somente após a nova arte ser salva. Compare as versões antes de aprovar.</p>
      </div>}
      {jobs.slice(0, 3).map((j) => (
        <p className="form-hint" key={j.id}>
          {j.format} ·{' '}
          {j.status === 'complete'
            ? 'Concluído'
            : j.status === 'failed'
              ? 'Falhou'
              : j.status === 'unknown'
                ? 'Pedido sem confirmação. Verifique a conta Magnific antes de repetir.'
                : 'Processando'}{' '}
          {j.message}
        </p>
      ))}
    </section>
  );
}
