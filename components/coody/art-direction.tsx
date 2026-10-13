'use client';
import { useState } from 'react';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from './forms';
import { Picker } from './shared';
import {
  analysisLabels,
  dnaFields,
  emptyDNA,
  genericElements,
  lineSuggestions,
  MAX_LINES,
  referenceStatuses,
  sophisticationLevels,
  type ArtDNA,
  type CreativeLine,
  type ReferenceAnalysis,
  type ReferenceMeta,
} from '@/lib/art-direction';

/* ---------------- DNA criativo (editor da marca) ---------------- */

export function DNAEditor({ value, onChange }: { value?: ArtDNA; onChange: (v: ArtDNA) => void }) {
  const dna = value || emptyDNA();
  const set = (k: keyof ArtDNA, v: unknown) => onChange({ ...dna, [k]: v });
  return (
    <div className="dna-editor">
      <p className="form-hint">
        O perfil de direção de arte deste cliente. O diretor de arte da IA lê tudo isto antes de propor qualquer peça.
        Cores e fontes ficam na aba Identidade.
      </p>
      <h3 className="section-space">Identidade visual</h3>
      {dnaFields
        .filter((f) => f.group === 'identidade')
        .map((f) => (
          <Field key={f.key} label={f.label}>
            <Textarea rows={2} placeholder={f.hint} value={dna[f.key]} onChange={(e) => set(f.key, e.target.value)} />
          </Field>
        ))}
      <h3 className="section-space">Personalidade criativa</h3>
      <Field label="Nível de sofisticação visual">
        <Picker
          label="Nível de sofisticação visual"
          value={dna.sophistication}
          onChange={(v) => set('sophistication', v)}
          options={[{ value: '', label: 'Não definido' }, ...sophisticationLevels.map((s) => ({ value: s, label: s }))]}
        />
      </Field>
      {dnaFields
        .filter((f) => f.group === 'personalidade')
        .map((f) => (
          <Field key={f.key} label={f.label}>
            <Textarea rows={2} placeholder={f.hint} value={dna[f.key]} onChange={(e) => set(f.key, e.target.value)} />
          </Field>
        ))}
      <h3 className="section-space">Recursos que fazem parte da identidade</h3>
      <p className="form-hint">
        Por padrão a IA evita estes recursos de “estilo genérico de IA”. Marque só os que fazem parte do DNA deste
        cliente; eles continuarão respeitando as referências da marca.
      </p>
      <div className="dna-generic">
        {genericElements.map((g) => (
          <label key={g} className="check-label">
            <Checkbox
              checked={dna.allowedGeneric.includes(g)}
              onCheckedChange={(v) =>
                set('allowedGeneric', v ? [...dna.allowedGeneric, g] : dna.allowedGeneric.filter((x) => x !== g))
              }
            />
            {g}
          </label>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Linhas criativas ---------------- */

const newId = () => 'l' + Math.random().toString(36).slice(2, 10);
export function LinesEditor({ value, onChange }: { value?: CreativeLine[]; onChange: (v: CreativeLine[]) => void }) {
  const lines = value || [];
  const missing = lineSuggestions.filter(
    (s) => !lines.some((l) => l.name.toLocaleLowerCase('pt-BR') === s.name.toLocaleLowerCase('pt-BR')),
  );
  const full = lines.length >= MAX_LINES;
  return (
    <div className="lines-editor">
      <p className="form-hint">
        Linhas criativas são caminhos visuais próprios deste cliente. Ao pedir conceitos, você escolhe uma ou combina
        várias. As sugestões abaixo são pontos de partida: ajuste o texto ao jeito da marca.
      </p>
      {lines.map((l, i) => (
        <div className="line-edit" key={l.id}>
          <div className="line-edit-head">
            <Input
              aria-label={'Nome da linha ' + (i + 1)}
              maxLength={80}
              placeholder="Nome da linha"
              value={l.name}
              onChange={(e) => onChange(lines.map((x) => (x.id === l.id ? { ...x, name: e.target.value } : x)))}
            />
            <button
              type="button"
              className="outline-btn"
              aria-label={'Excluir linha ' + (l.name || i + 1)}
              onClick={() => onChange(lines.filter((x) => x.id !== l.id))}
            >
              <Trash2 size={15} />
            </button>
          </div>
          <Textarea
            rows={2}
            maxLength={1500}
            aria-label={'Descrição da linha ' + (l.name || i + 1)}
            placeholder="Como é esta linha nesta marca: tipografia, luz, cenários, materiais, tom…"
            value={l.description}
            onChange={(e) => onChange(lines.map((x) => (x.id === l.id ? { ...x, description: e.target.value } : x)))}
          />
        </div>
      ))}
      {!lines.length && <p className="muted">Nenhuma linha criativa ainda.</p>}
      <div className="line-suggestions">
        <button
          type="button"
          className="outline-btn"
          disabled={full}
          onClick={() => onChange([...lines, { id: newId(), name: '', description: '' }])}
        >
          <Plus size={15} /> Nova linha
        </button>
        {missing.map((s) => (
          <button
            type="button"
            key={s.name}
            className="text-btn"
            disabled={full}
            onClick={() => onChange([...lines, { id: newId(), ...s }])}
          >
            + {s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Ficha da referência (Biblioteca) ---------------- */

export function ReferenceSheet({
  assetId,
  value,
  onChange,
  analysis,
  analyzedAt,
  canAnalyze,
  onAnalyzed,
}: {
  assetId: string;
  value: ReferenceMeta;
  onChange: (v: ReferenceMeta) => void;
  analysis?: ReferenceAnalysis | null;
  analyzedAt?: string;
  canAnalyze: boolean;
  onAnalyzed: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fresh, setFresh] = useState<ReferenceAnalysis | null>(null);
  const shown = fresh || analysis;
  const analyze = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/openai/reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId }),
      });
      const d = (await r.json()) as { analysis?: ReferenceAnalysis; error?: string };
      if (!r.ok || !d.analysis) throw new Error(d.error || 'Não foi possível analisar.');
      setFresh(d.analysis);
      await onAnalyzed();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const set = (k: keyof ReferenceMeta, v: string) => onChange({ ...value, [k]: v });
  return (
    <section className="reference-sheet">
      <h3>Ficha da referência</h3>
      <div className="form-grid">
        <Field label="Nome da campanha">
          <Input maxLength={120} value={value.campaign} onChange={(e) => set('campaign', e.target.value)} />
        </Field>
        <Field label="Status">
          <Picker
            label="Status da referência"
            value={value.status}
            onChange={(v) => set('status', v)}
            options={referenceStatuses.map((s) => ({
              value: s,
              label: s === 'aprovada' ? 'Aprovada' : s === 'em análise' ? 'Em análise' : 'Não usar na criação',
            }))}
          />
        </Field>
      </div>
      <Field label="Estilo visual">
        <Input maxLength={200} placeholder="Ex.: editorial minimalista, foto de produto em luz natural…" value={value.style} onChange={(e) => set('style', e.target.value)} />
      </Field>
      <Field label="Descrição da direção de arte">
        <Textarea rows={2} maxLength={2000} value={value.artDirection} onChange={(e) => set('artDirection', e.target.value)} />
      </Field>
      <Field label="Elementos que devem ser preservados">
        <Textarea rows={2} maxLength={1000} value={value.preserve} onChange={(e) => set('preserve', e.target.value)} />
      </Field>
      <Field label="Observações do diretor de criação">
        <Textarea rows={2} maxLength={2000} value={value.directorNotes} onChange={(e) => set('directorNotes', e.target.value)} />
      </Field>
      <div className="reference-analysis">
        <div className="reference-analysis-head">
          <strong>Análise visual da IA</strong>
          {canAnalyze && (
            <button type="button" className="outline-btn" disabled={busy} onClick={() => void analyze()}>
              <Sparkles size={15} /> {busy ? 'Analisando…' : shown ? 'Analisar de novo' : 'Analisar com IA'}
            </button>
          )}
        </div>
        {shown ? (
          <dl>
            {(Object.keys(analysisLabels) as (keyof ReferenceAnalysis)[])
              .filter((k) => shown[k])
              .map((k) => (
                <div key={k}>
                  <dt>{analysisLabels[k]}</dt>
                  <dd>{shown[k]}</dd>
                </div>
              ))}
          </dl>
        ) : (
          <p className="form-hint">
            A IA olha a imagem e registra composição, tipografia, luz, materiais e o que preservar. Isso vira repertório
            para os próximos conceitos — sem copiar a peça. Usa a API OpenAI.
          </p>
        )}
        {!fresh && analyzedAt && <p className="form-hint">Analisada em {new Date(analyzedAt).toLocaleDateString('pt-BR')}.</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
