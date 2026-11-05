'use client';
import { IntegrationTitle, integrationState, useIntegrationStatus } from './integration-status';
export function OpenAIIntegration() {
  const status = useIntegrationStatus('/api/openai');
  return (
    <section className="panel">
      <IntegrationTitle title="OpenAI · criativos" state={integrationState(status)} />
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
        Motor de todo o fluxo: planejamento do mês, “Preencher com IA” na marca, análise das referências, os 3 conceitos
        da Direção Criativa, a arte (Feed e Story 9:16), os ajustes e a validação. Cobrança pela conta da API OpenAI.
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
