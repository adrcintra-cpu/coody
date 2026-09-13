'use client';
import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import type { State } from '@/lib/types';
type Option = { id: string; name: string };
type Model = {
  connected: boolean;
  config?: {
    memberName: string;
    boardId: string;
    boardName: string;
    approvalList: string;
    changesList: string;
    approvedList: string;
  };
  boards?: Option[];
  lists?: Option[];
  exports?: { id: string; contentId: string; cardUrl: string; state: string }[];
};
export function TrelloIntegration({ state }: { state: State }) {
  const [model, setModel] = useState<Model | null>(null),
    [key, setKey] = useState(''),
    [token, setToken] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [board, setBoard] = useState(''),
    [approval, setApproval] = useState(''),
    [changes, setChanges] = useState(''),
    [approved, setApproved] = useState(''),
    [contentId, setContentId] = useState('');
  async function load(selected?: string) {
    const r = await fetch(
      '/api/trello' +
        (selected ? '?board=' + encodeURIComponent(selected) : ''),
      { cache: 'no-store' },
    );
    const data = (await r.json()) as Model & { error?: string };
    if (!r.ok) throw new Error(data.error);
    setModel(data);
    if (selected === undefined) {
      setBoard(data.config?.boardId || '');
      setApproval(data.config?.approvalList || '');
      setChanges(data.config?.changesList || '');
      setApproved(data.config?.approvedList || '');
    }
  }
  useEffect(() => {
    const controller=new AbortController();
    fetch('/api/trello',{cache:'no-store',signal:controller.signal}).then(async response=>{
      const data=await response.json() as Model & {error?:string};
      if(!response.ok)throw new Error(data.error);return data;
    }).then(data=>{setModel(data);setBoard(data.config?.boardId||'');setApproval(data.config?.approvalList||'');setChanges(data.config?.changesList||'');setApproved(data.config?.approvedList||'');}).catch(e=>{if(e.name!=='AbortError')setError(e.message);});
    return ()=>controller.abort();
  }, []);
  async function action(data: Record<string, string>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const r = await fetch('/api/trello', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = (await r.json()) as { error?: string; message?: string };
      if (!r.ok) throw new Error(result.error);
      setMessage(result.message || 'Salvo.');
      setToken('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na integração.');
    } finally {
      setBusy(false);
    }
  }
  const authUrl =
    'https://trello.com/1/authorize?' +
    new URLSearchParams({
      expiration: '30days',
      scope: 'read,write',
      response_type: 'token',
      name: 'COODY',
      key,
    });
  const select = (
    label: string,
    value: string,
    change: (v: string) => void,
    options: Option[],
  ) => (
    <label className="field">
      <span>{label}</span>
      <select
        value={value}
        disabled={busy}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">Selecione…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="panel">
      <h2>Trello</h2>
      <p>
        <a
          href="https://trello.com/b/nvUBy791/meu-quadro-do-trello"
          target="_blank"
          rel="noreferrer"
        >
          Abrir seu quadro do Trello
        </a>
      </p>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {message && <output className="notice">{message}</output>}
      {model?.connected ? (
        <>
          <p className="stage-label">Conectado: {model.config?.memberName}</p>
          {select(
            'Quadro',
            board,
            (v) => {
              setBoard(v);
              setApproval('');
              setChanges('');
              setApproved('');
              setBusy(true);
              load(v)
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            },
            model.boards || [],
          )}
          {select(
            'Aguardando aprovação',
            approval,
            setApproval,
            model.lists || [],
          )}
          {select(
            'Alterações solicitadas',
            changes,
            setChanges,
            model.lists || [],
          )}
          {select('Aprovados', approved, setApproved, model.lists || [])}
          <button
            className="outline-btn section-space"
            disabled={busy || !board || !approval || !changes || !approved}
            onClick={() =>
              action({
                action: 'configure',
                boardId: board,
                approvalList: approval,
                changesList: changes,
                approvedList: approved,
              })
            }
          >
            Salvar quadro e listas
          </button>
          {model.config?.boardId && (
            <>
              <h3 className="section-space">Enviar para aprovação</h3>
              <p>
                O texto e cópias das artes serão compartilhados com os
                participantes do quadro {model.config.boardName}.
              </p>
              {select(
                'Conteúdo',
                contentId,
                setContentId,
                state.contents
                  .filter((c) => c.status === 'APROVAÇÃO')
                  .map((c) => ({
                    id: c.id,
                    name:
                      (state.brands.find((b) => b.id === c.brandId)?.name ||
                        '') +
                      ' · ' +
                      c.title,
                  })),
              )}
              <button
                className="create-btn section-space"
                disabled={busy || !contentId}
                onClick={() => action({ action: 'send', contentId })}
              >
                {busy ? 'Processando…' : 'Enviar conteúdo e artes ao Trello'}
              </button>
              <p className="notice">
                Disponíveis apenas pautas que aguardam aprovação. O envio é
                manual. Movimentos e comentários no Trello não alteram o COODY
                automaticamente.
              </p>
              <h3>Envios</h3>
              {!model.exports?.length && <p>Nenhum envio realizado.</p>}
              {model.exports?.map((item) => (
                <div className="detail-line" key={item.id}>
                  <span>
                    {state.contents.find((c) => c.id === item.contentId)
                      ?.title || 'Conteúdo'}{' '}
                    · {item.state === 'sent' ? 'Enviado' : 'Envio incompleto'}
                  </span>
                  {item.cardUrl && (
                    <a href={item.cardUrl} target="_blank" rel="noreferrer">
                      Abrir card
                    </a>
                  )}
                </div>
              ))}
            </>
          )}
          <button
            className="text-btn section-space"
            disabled={busy}
            onClick={() => action({ action: 'disconnect' })}
          >
            Desconectar do COODY
          </button>
        </>
      ) : (
        <>
          <p>
            Autorize sua conta para consultar quadros e enviar conteúdos. Cole
            as credenciais somente nesta tela privada.
          </p>
          <p>
            <a
              href="https://trello.com/apps/admin"
              target="_blank"
              rel="noreferrer"
            >
              Obter chave de API no Trello
            </a>
          </p>
          <label className="field" htmlFor="trello-api-key">
            <span>Chave de API</span>
            <Input
              id="trello-api-key" autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value.trim())}
            />
          </label>
          {/^[a-zA-Z0-9]{20,128}$/.test(key) && (
            <p>
              <a href={authUrl} target="_blank" rel="noreferrer">
                Autorizar COODY no Trello e obter token
              </a>
            </p>
          )}
          <label className="field" htmlFor="trello-token">
            <span>Token de autorização</span>
            <Input
              id="trello-token" type="password"
              autoComplete="new-password"
              value={token}
              onChange={(e) => setToken(e.target.value.trim())}
            />
          </label>
          <button
            className="create-btn section-space"
            disabled={busy || !key || !token}
            onClick={() => action({ action: 'connect', key, token })}
          >
            {busy ? 'Conectando…' : 'Conectar conta Trello'}
          </button>
          <p className="muted">
            Token armazenado criptografado no servidor. A autorização solicitada
            dura 30 dias e pode ser revogada no Trello.
          </p>
        </>
      )}
    </section>
  );
}
