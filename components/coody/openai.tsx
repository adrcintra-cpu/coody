'use client';
import { useState } from 'react';
import { IntegrationMissing, useIntegrationStatus } from './integration-status';
export function OpenAIIntegration() {
  const status = useIntegrationStatus('/api/openai');
  return (
    <section className="panel">
      <h2>OpenAI · criativos</h2>
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
        Criação de headline, legenda, hashtags e arte a partir da pauta. O Story
        usa a mesma arte. A nova versão aparece no
        Studio em revisão, antes da aprovação. Cobrança pela conta da API
        OpenAI.
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
export function ImageGenerator({
  contentId,
  formats,
  onBusy,
  disabled,
  reload,
}: {
  contentId: string;
  formats: string;
  onBusy: (value: boolean) => void;
  disabled: boolean;
  reload: () => Promise<void>;
}) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const status = useIntegrationStatus('/api/openai');
  const unavailable = status.configured === false;
  return (
    <section className="panel section-space">
      <h2>Criar criativo com IA</h2>
      {unavailable && <IntegrationMissing name="OpenAI" />}
      <label htmlFor="image-description">Orientação adicional (opcional)</label>
      <textarea
        id="image-description"
        className="full"
        rows={4}
        maxLength={3000}
        value={prompt}
        disabled={busy || disabled || unavailable}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="O briefing e as regras da marca já serão usados. Acrescente uma direção, se desejar."
      />
      <p className="form-hint">
        Gera textos e uma arte para {formats} (o Story
        usa a mesma arte) e salva uma nova versão em revisão. Revise a escrita nas artes antes de
        aprovar. Usa os logotipos, referências e PDFs da biblioteca desta marca,
        enviados à OpenAI para orientar a criação. Confira a fidelidade do logo
        antes de aprovar. Cobrança pela API OpenAI.
      </p>
      <button
        className="create-btn"
        disabled={disabled || busy || unavailable || status.checking}
        onClick={async () => {
          setBusy(true);
          onBusy(true);
          setMessage(
            'Criando textos e artes. Aguarde a conclusão; isso pode levar alguns minutos…',
          );
          try {
            const response = await fetch('/api/openai', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: crypto.randomUUID(),
                contentId,
                mode: 'creative',
                prompt,
              }),
            });
            const result = (await response.json()) as { error?: string };
            if (!response.ok)
              throw new Error(result.error || 'Falha na geração.');
            setMessage(
              'Criativo salvo em uma nova versão. Revise os textos e as artes e envie para aprovação.',
            );
            await reload();
          } catch (error) {
            setMessage(
              error instanceof Error
                ? error.message
                : 'Conexão interrompida. Confira a biblioteca antes de gerar novamente.',
            );
          } finally {
            setBusy(false);
            onBusy(false);
          }
        }}
      >
        {busy ? 'Gerando…' : 'Criar criativo completo · ' + formats}
      </button>
      <output>{message}</output>
    </section>
  );
}
