'use client';
import { useCallback, useEffect, useState } from 'react';

export type IntegrationStatus = {
  configured: boolean | null;
  message: string;
  checkedAt: Date | null;
  checking: boolean;
};

/** Reads GET /api/openai or /api/magnific ({ configured, message }). */
export function useIntegrationStatus(endpoint: '/api/openai' | '/api/magnific') {
  const [status, setStatus] = useState<IntegrationStatus>({
    configured: null,
    message: 'Verificando conexão…',
    checkedAt: null,
    checking: true,
  });
  const check = useCallback(async () => {
    setStatus((s) => ({ ...s, checking: true }));
    try {
      const r = await fetch(endpoint, { cache: 'no-store' });
      const d = (await r.json()) as { configured?: boolean; message?: string };
      setStatus({
        configured: d.configured ?? null,
        message: d.message || 'Não foi possível verificar.',
        checkedAt: new Date(),
        checking: false,
      });
    } catch {
      setStatus({
        configured: null,
        message: 'Não foi possível verificar a conexão.',
        checkedAt: new Date(),
        checking: false,
      });
    }
  }, [endpoint]);
  useEffect(() => {
    void check();
  }, [check]);
  return { ...status, check };
}

export function IntegrationMissing({ name }: { name: string }) {
  return (
    <p className="notice" role="status">
      Integração com {name} não configurada neste ambiente, por isso a geração
      está desativada. A chave deve ser adicionada nas variáveis de ambiente do
      servidor.{' '}
      <a href="#Integra%C3%A7%C3%B5es">Ver Integrações</a>
    </p>
  );
}
