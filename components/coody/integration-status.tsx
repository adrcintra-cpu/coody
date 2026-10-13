'use client';
import { useCallback, useEffect, useState } from 'react';
import { CircleCheck, CircleX, CircleDashed, LoaderCircle } from 'lucide-react';

export type IntegrationStatus = {
  configured: boolean | null;
  /** The service accepted the key (null when unknown). */
  connected: boolean | null;
  message: string;
  checkedAt: Date | null;
  checking: boolean;
};

/** Reads GET /api/openai or /api/magnific ({ configured, message }). */
export function useIntegrationStatus(endpoint: '/api/openai' | '/api/magnific') {
  const [status, setStatus] = useState<IntegrationStatus>({
    configured: null,
    connected: null,
    message: 'Verificando conexão…',
    checkedAt: null,
    checking: true,
  });
  const check = useCallback(async () => {
    setStatus((s) => ({ ...s, checking: true }));
    try {
      const r = await fetch(endpoint, { cache: 'no-store' });
      const d = (await r.json()) as { configured?: boolean; connected?: boolean; message?: string };
      setStatus({
        configured: d.configured ?? null,
        connected: d.connected ?? null,
        message: d.message || 'Não foi possível verificar.',
        checkedAt: new Date(),
        checking: false,
      });
    } catch {
      setStatus({
        configured: null,
        connected: null,
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

/** Card title with the connection state: a green "Conectado" when the
 *  service accepted the key, red when it refused it, grey when not set up. */
export function IntegrationTitle({
  title,
  state,
}: {
  title: string;
  state: 'checking' | 'connected' | 'failed' | 'missing';
}) {
  const badge = {
    checking: { icon: <LoaderCircle size={15} className="animate-spin" />, label: 'Verificando' },
    connected: { icon: <CircleCheck size={15} />, label: 'Conectado' },
    failed: { icon: <CircleX size={15} />, label: 'Não conectado' },
    missing: { icon: <CircleDashed size={15} />, label: 'Não configurado' },
  }[state];
  return (
    <div className="integration-title">
      <h2>{title}</h2>
      <span className={'integration-badge ' + state} role="status">
        {badge.icon} {badge.label}
      </span>
    </div>
  );
}
export function integrationState(status: IntegrationStatus): 'checking' | 'connected' | 'failed' | 'missing' {
  if (status.checking && !status.checkedAt) return 'checking';
  if (status.configured === false) return 'missing';
  return status.connected ? 'connected' : 'failed';
}
