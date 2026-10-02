'use client';
import { useState } from 'react';
import { LoaderCircle, Sparkles } from 'lucide-react';
import { mergeSuggestion, type BrandSuggestion } from '@/lib/brand-assist';
import { useIntegrationStatus } from './integration-status';
import type { Brand } from '@/lib/types';

const identityMimes = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
/** Vercel accepts ~4.5 MB per request; keep the files under this. */
const FILES_BUDGET = 3.5 * 1024 * 1024;

/**
 * "Preencher com IA": asks the model for the brand fields and fills only the
 * ones still empty (pillars and goals only while they hold the defaults).
 * Nothing is saved here; the form is saved by the user after review.
 */
export function BrandAssist({
  brand,
  onChange,
  defaults,
  brandId,
  files = [],
  hint,
}: {
  brand: Brand;
  onChange: (brand: Brand) => void;
  defaults: Pick<Brand, 'pillars' | 'monthlyGoal' | 'weeklyGoal'>;
  /** Existing brand: the server reads its logos and manual from the Library. */
  brandId?: string;
  /** New brand: identity files not yet saved (manual, logos). */
  files?: { file: File; category: string }[];
  hint?: string;
}) {
  const status = useIntegrationStatus('/api/openai');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{
    filled: string[];
    review: string;
    site: string;
    files: number;
  } | null>(null);
  const ready = !!brand.name.trim() && !!brand.segment.trim();
  const unavailable = status.configured === false;
  return (
    <section className="brand-assist" aria-live="polite">
      <div className="brand-assist-head">
        <div>
          <strong>
            <Sparkles size={15} /> Preencher com IA
          </strong>
          <p className="form-hint">
            {hint ||
              'Sugere os campos vazios a partir do nome, segmento, site, anotações e arquivos da marca. Nada é salvo antes da sua revisão.'}
          </p>
        </div>
        <button
          type="button"
          className="outline-btn"
          disabled={busy || !ready || unavailable || status.checking}
          title={ready ? '' : 'Preencha nome e segmento primeiro.'}
          onClick={async () => {
            setBusy(true);
            setError('');
            setResult(null);
            try {
              const form = new FormData();
              form.set('payload', JSON.stringify({ brandId: brandId || '', brand }));
              if (!brandId) {
                let total = 0;
                for (const { file } of files
                  .filter(
                    (f) =>
                      ['brandbook', 'logo'].includes(f.category) &&
                      identityMimes.includes(f.file.type),
                  )
                  // The manual carries the most rules: send it first.
                  .sort(
                    (a, b) =>
                      Number(b.category === 'brandbook') -
                      Number(a.category === 'brandbook'),
                  )
                  .slice(0, 4)) {
                  if (total + file.size > FILES_BUDGET) continue;
                  total += file.size;
                  form.append('files', file);
                }
              }
              const response = await fetch('/api/openai/brand', {
                method: 'POST',
                body: form,
              });
              const data = (await response.json()) as {
                suggestion?: BrandSuggestion;
                sources?: { site: string; files: number };
                error?: string;
              };
              if (!response.ok || !data.suggestion)
                throw new Error(data.error || 'Não foi possível preencher com IA.');
              const merged = mergeSuggestion(brand, data.suggestion, defaults);
              onChange(merged.brand);
              setResult({
                filled: merged.filled,
                review: data.suggestion.review,
                site: data.sources?.site || '',
                files: data.sources?.files || 0,
              });
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? (
            <LoaderCircle size={15} className="animate-spin" />
          ) : (
            <Sparkles size={15} />
          )}
          {busy ? 'Analisando…' : 'Preencher com IA'}
        </button>
      </div>
      {unavailable && (
        <p className="form-hint">
          A OpenAI não está configurada neste ambiente.
        </p>
      )}
      {result && (
        <div className="notice brand-assist-result">
          {result.filled.length ? (
            <p>
              <strong>Sugestões preenchidas ({result.filled.length}):</strong>{' '}
              {result.filled.join(', ')}. Revise antes de salvar.
            </p>
          ) : (
            <p>
              Nenhum campo vazio recebeu sugestão. Os campos que você já
              preencheu não foram alterados.
            </p>
          )}
          {result.review && <p>Confira: {result.review}</p>}
          <p className="form-hint">
            Fontes usadas: dados do formulário
            {result.site === 'lido' ? ', site' : ''}
            {result.files ? `, ${result.files} arquivo(s) da identidade` : ''}.
            {result.site && result.site !== 'lido' ? ' ' + result.site : ''}
          </p>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
