'use client';
import { useState, useEffect } from 'react';
import type { State, Content } from '@/lib/types';
type Job = { id: string; status: string; message: string; format: string };
export function MagnificIntegration() {
  const [message, setMessage] = useState('Verificando Magnific…');
  useEffect(() => {
    let active = true;
    fetch('/api/magnific')
      .then((r) => r.json() as Promise<{ message: string }>)
      .then((d) => {
        if (active) setMessage(d.message);
      })
      .catch(() => {
        if (active) setMessage('Não foi possível verificar Magnific.');
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="panel">
      <h2>Magnific · novas artes</h2>
      <output>{message}</output>
      <p>
        Gere artes Feed e Story no Studio com até quatro imagens da Biblioteca.
        Os resultados são salvos para revisão. As APIs usam créditos separados
        das assinaturas dos aplicativos.
      </p>
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
  const [prompt, setPrompt] = useState(''),
    [format, setFormat] = useState(
      item.format.includes('Feed') ? 'Feed' : 'Story',
    ),
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
  async function generate() {
    setBusy(true);
    setMessage('Enviando pedido…');
    try {
      const r = await fetch('/api/magnific', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentId: item.id,
          format,
          prompt,
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
      <label className="field">
        Formato
        <select
          className="workspace-input"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        >
          {['Feed', 'Story']
            .filter((f) => item.format.includes(f))
            .map((f) => (
              <option key={f}>{f}</option>
            ))}
        </select>
      </label>
      <label className="field">
        Descreva o criativo
        <textarea
          className="workspace-input"
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
        disabled={disabled || busy || pending || !prompt.trim()}
        onClick={() => void generate()}
      >
        {busy
          ? 'Enviando…'
          : pending
            ? 'Geração em andamento'
            : 'Gerar arte · ' + format}
      </button>
      <output aria-live="polite">{message}</output>
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
