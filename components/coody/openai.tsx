'use client';
import { useEffect, useState } from 'react';
export function OpenAIIntegration() {
  const [message, setMessage] = useState('Verificando conexão…');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/api/openai')
      .then((r) => r.json() as Promise<{ message?: string }>)
      .then((d) => {
        if (active) setMessage(d.message || 'Não foi possível verificar.');
      })
      .catch(() => {
        if (active) setMessage('Não foi possível verificar a conexão.');
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="panel">
      <h2>OpenAI · criativos</h2>
      <output>{message}</output>
      <p>
        Criação de headline, legenda, hashtags e artes a partir da pauta. A nova
        versão aparece no Studio em revisão, antes da aprovação. Cobrança pela
        conta da API OpenAI.
      </p>
      <button
        className="outline-btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await fetch('/api/openai');
            const d = (await r.json()) as { message?: string };
            setMessage(d.message || 'Falha na verificação.');
          } catch {
            setMessage('Não foi possível verificar a conexão.');
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Verificando…' : 'Verificar conexão'}
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
  return (
    <section className="panel section-space">
      <h2>Criar criativo com IA</h2>
      <label htmlFor="image-description">Orientação adicional (opcional)</label>
      <textarea
        id="image-description"
        className="full"
        rows={4}
        maxLength={3000}
        value={prompt}
        disabled={busy || disabled}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="O briefing e as regras da marca já serão usados. Acrescente uma direção, se desejar."
      />
      <p className="form-hint">
        Gera textos e artes para {formats}, aplica as imagens automaticamente e
        salva uma nova versão em revisão. Revise a escrita nas artes antes de
        aprovar. Usa as orientações textuais da marca; os arquivos da biblioteca
        não são enviados. Cobrança pela API OpenAI.
      </p>
      <button
        className="create-btn"
        disabled={disabled || busy}
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
