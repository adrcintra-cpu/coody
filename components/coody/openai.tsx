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
      <h2>OpenAI · imagens</h2>
      <p role="status">{message}</p>
      <p>
        Geração no Studio a partir do briefing, das orientações da marca e da
        sua descrição. As imagens ficam na biblioteca para revisão. Cobrança
        pela conta da API OpenAI.
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
  format,
  disabled,
  reload,
}: {
  contentId: string;
  format: string;
  disabled: boolean;
  reload: () => Promise<void>;
}) {
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  return (
    <section className="panel section-space">
      <h2>Gerar imagem com OpenAI</h2>
      <label htmlFor="image-description">Descreva a imagem</label>
      <textarea
        id="image-description"
        className="full"
        rows={4}
        maxLength={3000}
        value={prompt}
        disabled={busy || disabled}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Cena, estilo, composição e elementos desejados"
      />
      <p className="form-hint">
        {format === 'feed' ? 'Feed · 1024 × 1280' : 'Story · 1152 × 2048'} ·
        qualidade econômica. Usa orientações textuais da marca; os arquivos da
        biblioteca não são enviados à OpenAI. Cada geração pode gerar cobrança
        na API.
      </p>
      <button
        className="create-btn"
        disabled={disabled || busy || !prompt.trim()}
        onClick={async () => {
          setBusy(true);
          setMessage('Gerando imagem. Isso pode levar alguns minutos…');
          try {
            const response = await fetch('/api/openai', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: crypto.randomUUID(),
                contentId,
                format,
                prompt,
              }),
            });
            const result = (await response.json()) as { error?: string };
            if (!response.ok)
              throw new Error(result.error || 'Falha na geração.');
            setMessage(
              'Imagem salva na biblioteca. Selecione-a em Arte do Feed ou Arte do Story e salve uma nova versão após revisar.',
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
          }
        }}
      >
        {busy
          ? 'Gerando…'
          : 'Gerar imagem · ' + (format === 'feed' ? 'Feed' : 'Story')}
      </button>
      <p role="status">{message}</p>
    </section>
  );
}
