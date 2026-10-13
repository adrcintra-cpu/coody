'use client';
import { useCallback, useEffect, useState } from 'react';
import { Check, Compass, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useIntegrationStatus, IntegrationMissing } from './integration-status';
import {
  briefLabels,
  conceptHints,
  directionKeys,
  type ArtValidation,
  type BriefReading,
  type Concept,
} from '@/lib/art-direction';
import type { Brand, Content, Version } from '@/lib/types';

type Direction = {
  id: string;
  reading: BriefReading;
  concepts: Concept[];
  lines: string[];
  instructions: string;
  chosen: number;
  chosenAt: string | null;
  createdBy: string;
  createdAt: string;
};
const post = async <T,>(url: string, body: unknown): Promise<T> => {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(d.error || 'Não foi possível concluir.');
  return d;
};

/**
 * Direção Criativa: before any image, the AI art director reads the brand and
 * the brief and proposes three concepts (Seguro, Autoral, Experimental). The
 * team approves one (the art is created following it), asks for variations or
 * adds instructions. Each decision stays in the piece's history.
 */
export function CreativeDirection({
  item,
  brand,
  version,
  disabled,
  onBusy,
  reload,
}: {
  item: Content;
  brand: Brand;
  version?: Version;
  disabled: boolean;
  onBusy: (v: boolean) => void;
  reload: () => Promise<void>;
}) {
  const status = useIntegrationStatus('/api/openai');
  const unavailable = status.configured === false;
  const lines = brand.creativeLines || [];
  const [lineIds, setLineIds] = useState<string[]>([]);
  const [instructions, setInstructions] = useState('');
  const [history, setHistory] = useState<Direction[]>([]);
  const [shownId, setShownId] = useState('');
  const [busy, setBusy] = useState<'' | 'concepts' | 'generate' | 'validate'>('');
  const [message, setMessage] = useState('');
  const [variation, setVariation] = useState<{ index: number; text: string } | null>(null);
  const load = useCallback(async () => {
    const r = await fetch('/api/openai/direction?contentId=' + item.id, { cache: 'no-store' });
    const d = (await r.json().catch(() => ({}))) as { directions?: Direction[] };
    setHistory(d.directions || []);
  }, [item.id]);
  useEffect(() => {
    void load();
  }, [load]);
  const shown = history.find((h) => h.id === shownId) || history[0];
  const working = !!busy;
  const run = async (kind: typeof busy, fn: () => Promise<void>) => {
    setBusy(kind);
    onBusy(true);
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy('');
      onBusy(false);
    }
  };
  const propose = (base?: { id: string; index: number }, extra = '') =>
    run('concepts', async () => {
      setMessage('O diretor de arte está estudando a marca e o briefing…');
      const d = await post<{ direction: Direction }>('/api/openai/direction', {
        contentId: item.id,
        lineIds,
        instructions: [instructions, extra].filter((t) => t.trim()).join('\n'),
        base,
      });
      setHistory((old) => [d.direction, ...old]);
      setShownId(d.direction.id);
      setVariation(null);
      setMessage('');
    });
  const validate = (versionId: string) =>
    run('validate', async () => {
      setMessage('Validando a arte contra a identidade e o briefing…');
      await post('/api/openai/validate', { versionId });
      await reload();
      setMessage('Validação concluída. Veja o resultado abaixo.');
    });
  const generate = (direction: Direction | null, index: number) =>
    run('generate', async () => {
      setMessage('Criando textos e arte com a direção escolhida. Isso pode levar alguns minutos…');
      const d = await post<{ versionId: string }>('/api/openai', {
        id: crypto.randomUUID(),
        contentId: item.id,
        mode: 'creative',
        prompt: instructions,
        ...(direction ? { directionId: direction.id, conceptIndex: index } : {}),
      });
      await load();
      await reload();
      // Etapa 6: check the new art before it goes to the client.
      setMessage('Arte criada. Validando aderência à marca…');
      try {
        await post('/api/openai/validate', { versionId: d.versionId });
        await reload();
        setMessage('Criativo salvo em uma nova versão e validado. Revise e envie para aprovação.');
      } catch (e) {
        setMessage('Criativo salvo em uma nova versão. A validação automática falhou: ' + (e as Error).message);
      }
    });
  const block = disabled || working || unavailable || status.checking;
  return (
    <section className="panel section-space creative-direction">
      <h2>
        <Compass size={18} /> Direção Criativa
      </h2>
      {unavailable && <IntegrationMissing name="OpenAI" />}
      <p className="form-hint">
        O diretor de arte da IA lê o DNA criativo, as referências (pelas imagens) e o briefing e propõe três conceitos.
        Aprove um para criar a arte seguindo essa direção.
      </p>
      {lines.length > 0 && (
        <fieldset className="direction-lines" disabled={block}>
          <legend>Linhas criativas (opcional, pode combinar)</legend>
          {lines.map((l) => (
            <label key={l.id} className="check-label" title={l.description}>
              <Checkbox
                checked={lineIds.includes(l.id)}
                onCheckedChange={(v) => setLineIds(v ? [...lineIds, l.id] : lineIds.filter((x) => x !== l.id))}
              />
              {l.name}
            </label>
          ))}
        </fieldset>
      )}
      <label htmlFor="direction-instructions">Instruções adicionais (opcional)</label>
      <textarea
        id="direction-instructions"
        className="full"
        rows={3}
        maxLength={2000}
        value={instructions}
        disabled={block}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Ex.: foco no lançamento, evitar pessoas, explorar a textura do café…"
      />
      <div className="form-actions direction-actions">
        <button type="button" className="text-btn" disabled={block} onClick={() => void generate(null, -1)}>
          Criar direto, sem conceitos
        </button>
        <button type="button" className="create-btn" disabled={block} onClick={() => void propose()}>
          <Sparkles size={16} /> {busy === 'concepts' ? 'Criando conceitos…' : history.length ? 'Propor novos conceitos' : 'Propor 3 conceitos'}
        </button>
      </div>
      {message && <output className="direction-message">{message}</output>}

      {shown && (
        <div className="direction-result">
          <div className="direction-head">
            <strong>
              {new Date(shown.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · {shown.createdBy}
            </strong>
            {history.length > 1 && (
              <select aria-label="Histórico de direções" value={shown.id} onChange={(e) => setShownId(e.target.value)}>
                {history.map((h) => (
                  <option key={h.id} value={h.id}>
                    {new Date(h.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                    {h.chosen >= 0 ? ' · escolhido: ' + h.concepts[h.chosen]?.name : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
          {(shown.lines.length > 0 || shown.instructions) && (
            <p className="form-hint">
              {shown.lines.length ? 'Linhas: ' + shown.lines.join(' + ') : ''}
              {shown.lines.length && shown.instructions ? ' · ' : ''}
              {shown.instructions}
            </p>
          )}
          <details className="direction-reading">
            <summary>Leitura do briefing</summary>
            <dl>
              {(Object.keys(briefLabels) as (keyof BriefReading)[])
                .filter((k) => shown.reading[k])
                .map((k) => (
                  <div key={k}>
                    <dt>{briefLabels[k]}</dt>
                    <dd>{shown.reading[k]}</dd>
                  </div>
                ))}
            </dl>
          </details>
          <div className="concepts">
            {shown.concepts.map((c, i) => (
              <article key={i} className={'concept' + (shown.chosen === i ? ' chosen' : '')}>
                <header>
                  <span className={'concept-kind ' + c.kind.toLowerCase()}>
                    Conceito 0{i + 1} — {c.kind}
                  </span>
                  {shown.chosen === i && (
                    <span className="concept-chosen">
                      <Check size={13} /> Escolhido
                    </span>
                  )}
                </header>
                <h3>{c.name}</h3>
                <small className="muted">{conceptHints[c.kind]}</small>
                <p>
                  <strong>Por quê:</strong> {c.rationale}
                </p>
                <p>
                  <strong>Imagem:</strong> {c.imageDescription}
                </p>
                <details>
                  <summary>Direção de arte</summary>
                  <dl>
                    {directionKeys
                      .filter(([k]) => c.direction[k])
                      .map(([k, label]) => (
                        <div key={k}>
                          <dt>{label}</dt>
                          <dd>{c.direction[k]}</dd>
                        </div>
                      ))}
                  </dl>
                </details>
                {c.referencesUsed.length > 0 && (
                  <p className="concept-tags">
                    <strong>Referências:</strong> {c.referencesUsed.join(' · ')}
                  </p>
                )}
                {c.preserved.length > 0 && (
                  <p className="concept-tags">
                    <strong>Identidade preservada:</strong> {c.preserved.join(' · ')}
                  </p>
                )}
                {variation?.index === i ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void propose({ id: shown.id, index: i }, variation.text);
                    }}
                  >
                    <textarea
                      className="full"
                      rows={2}
                      autoFocus
                      maxLength={1000}
                      placeholder="O que variar? (opcional)"
                      value={variation.text}
                      onChange={(e) => setVariation({ index: i, text: e.target.value })}
                    />
                    <div className="form-actions">
                      <button type="button" className="outline-btn" disabled={working} onClick={() => setVariation(null)}>
                        Voltar
                      </button>
                      <button className="outline-btn" disabled={block}>
                        <RefreshCw size={14} /> {busy === 'concepts' ? 'Criando…' : 'Gerar variações'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="form-actions">
                    <button
                      type="button"
                      className="outline-btn"
                      disabled={block}
                      onClick={() => setVariation({ index: i, text: '' })}
                    >
                      Pedir variações
                    </button>
                    <button type="button" className="create-btn" disabled={block} onClick={() => void generate(shown, i)}>
                      {busy === 'generate' ? 'Gerando…' : 'Aprovar e gerar · ' + item.format}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      )}
      {version?.feedUrl && (
        <ValidationReport
          version={version}
          busy={busy === 'validate'}
          disabled={block}
          onValidate={() => void validate(version.id)}
        />
      )}
      <p className="form-hint">
        Usa a API OpenAI (conceitos, criação e validação são cobrados à parte). Revise a escrita e o logo antes de aprovar.
      </p>
    </section>
  );
}

function ValidationReport({
  version,
  busy,
  disabled,
  onValidate,
}: {
  version: Version;
  busy: boolean;
  disabled: boolean;
  onValidate: () => void;
}) {
  let report: (ArtValidation & { checkedAt?: string }) | null = null;
  try {
    report = version.validation ? JSON.parse(version.validation) : null;
  } catch {
    report = null;
  }
  let concept = '';
  try {
    concept = version.direction ? (JSON.parse(version.direction) as { kind: string; name: string }).name : '';
  } catch {
    concept = '';
  }
  const tone = !report ? '' : report.nota >= 80 ? 'good' : report.nota >= 60 ? 'ok' : 'bad';
  return (
    <div className="validation-report">
      <div className="validation-head">
        <strong>
          <ShieldCheck size={16} /> Validação da versão {version.number}
          {concept ? ' · conceito “' + concept + '”' : ''}
        </strong>
        <button type="button" className="outline-btn" disabled={disabled} onClick={onValidate}>
          {busy ? 'Validando…' : report ? 'Validar de novo' : 'Validar arte'}
        </button>
      </div>
      {report ? (
        <>
          <p>
            <span className={'validation-score ' + tone}>{report.nota}/100</span>
            {report.checkedAt && (
              <small className="muted"> · {new Date(report.checkedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</small>
            )}
          </p>
          <dl>
            {report.identidade && (
              <div>
                <dt>Identidade</dt>
                <dd>{report.identidade}</dd>
              </div>
            )}
            {report.briefing && (
              <div>
                <dt>Briefing</dt>
                <dd>{report.briefing}</dd>
              </div>
            )}
            {report.referencias && (
              <div>
                <dt>Referências</dt>
                <dd>{report.referencias}</dd>
              </div>
            )}
          </dl>
          {[
            ['Clichês encontrados', report.cliches],
            ['Problemas', report.problemas],
            ['Sugestões', report.sugestoes],
          ].map(([label, items]) =>
            (items as string[]).length ? (
              <div key={label as string}>
                <strong>{label as string}</strong>
                <ul>
                  {(items as string[]).map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
        </>
      ) : (
        <p className="form-hint">Confere a arte contra a identidade, o briefing e as referências e aponta clichês.</p>
      )}
    </div>
  );
}
