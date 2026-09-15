'use client';
import { MagnificIntegration } from './magnific';
import { ProfilePhoto } from './profile-photo';
import { useState } from 'react';
import type { State } from '@/lib/types';
import { OpenAIIntegration } from './openai';
import { TrelloIntegration } from './trello';
export function Integrations({ state }: { state: State }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SERVIÇOS EXTERNOS</p>
          <h1>Integrações</h1>
          <p>Status dos recursos conectados ao COODY.</p>
        </div>
      </div>
      <div className="integration-grid">
        <OpenAIIntegration />
        <MagnificIntegration />
        <TrelloIntegration state={state} />
      </div>
    </>
  );
}
export function Settings({
  state,
  reload,
}: {
  state: State;
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const hasExamples = state.brands.some((b) =>
    ['b1', 'b2', 'b3'].includes(b.id),
  );
  async function removeExamples() {
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/maintenance/examples', {
        method: 'POST',
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error);
      await reload();
      setMessage('Exemplos removidos. Uma cópia de segurança foi preservada.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível remover os exemplos.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SEU ESPAÇO DE TRABALHO</p>
          <h1>Configurações</h1>
          <p>Acesso e dados do workspace.</p>
        </div>
      </div>
      <ProfilePhoto
        url={state.user?.avatarUrl}
        name={state.user?.name || 'Minha conta'}
        reload={reload}
      />
      <div className="settings-layout">
        <section className="panel">
          <h2>{state.user?.name || 'Minha conta'}</h2>
          <p>{state.user?.email}</p>
          <div className="detail-line">
            <span>Acesso</span>
            <strong>Administrador · proprietário</strong>
          </div>
          <div className="detail-line">
            <span>Workspace</span>
            <strong>COODY privado</strong>
          </div>
          <p className="notice">
            Acesso individual pela conta proprietária. Os cadastros, conteúdos e
            arquivos são salvos no workspace.
          </p>
        </section>
        <section className="panel">
          <h2>Seus dados</h2>
          <p>
            Exporte os cadastros, textos, histórico e metadados dos arquivos
            para guardar uma cópia. As imagens e documentos devem ser baixados
            pela biblioteca.
          </p>
          <a className="outline-btn" href="/api/backup" download>
            Exportar dados
          </a>
          <p className="notice">
            Acessos separados para equipe e clientes ainda não estão
            disponíveis.
          </p>
          {hasExamples && (
            <>
              <h3>Remover exemplos iniciais</h3>
              <p>
                Apenas a demonstração original sem alterações pode ser removida.
                Uma cópia de segurança será preservada.
              </p>
              <button
                className="outline-btn"
                disabled={busy}
                onClick={removeExamples}
              >
                {busy ? 'Removendo…' : 'Remover exemplos'}
              </button>
            </>
          )}
          {message && <output>{message}</output>}
        </section>
      </div>
    </>
  );
}
