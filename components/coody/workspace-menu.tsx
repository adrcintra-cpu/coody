'use client';
import { useState } from 'react';
import Image from 'next/image';
import { ChevronDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ProfilePhoto } from './profile-photo';
import { can } from '@/lib/permissions';
import type { State } from '@/lib/types';
export function WorkspaceMenu({
  state,
  reload,
}: {
  state: State | null;
  reload: () => Promise<void>;
}) {
  const canManage = can(state?.user?.role, 'manage');
  const [open, setOpen] = useState(false),
    [name, setName] = useState(''),
    [newName, setNewName] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function runAction(kind: string, extra: Record<string, string>) {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: kind, ...extra }),
      });
      const data = (await r.json()) as { error?: string; id?:string };
      if (!r.ok) throw new Error(data.error);
      if (kind === 'rename') {
        await reload();
        setError('Nome atualizado.');
      } else {
        window.location.replace('/?workspace=' + data.id + '#Dashboard');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setBusy(false);
    }
  }
  const w = state?.workspace;
  return (
    <>
      <button
        className="workspace-name"
        disabled={!state}
        onClick={() => {
          setName(w?.name || '');
          setOpen(true);
        }}
      >
        <span className="workspace-icon">
          {w?.avatarUrl ? (
            <Image
              unoptimized
              src={w.avatarUrl}
              width={36}
              height={36}
              alt=""
            />
          ) : (
            (w?.name || 'W').slice(0, 1).toUpperCase()
          )}
        </span>
        <span>
          {w?.name || 'Meu workspace'}
          <small>Gerenciar workspaces</small>
        </span>
        <ChevronDown size={14} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Seus workspaces</DialogTitle>
            <DialogDescription>
              Organize marcas e conteúdos em espaços separados. As integrações
              usam a mesma conta de API.
            </DialogDescription>
          </DialogHeader>
          <div className="workspace-choices">
            {state?.workspaces?.map((item) => (
              <button
                key={item.id}
                className="outline-btn"
                disabled={busy || item.id === w?.id}
                onClick={() => void runAction('select', { id: item.id })}
              >
                {item.name}
                {item.id === w?.id ? ' · atual' : ''}
              </button>
            ))}
          </div>
          {/* Renaming, the workspace photo and new workspaces: administrators only. */}
          {canManage && (
            <>
          <label className="field">
            Nome do workspace atual
            <input
              className="workspace-input"
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <button
            className="outline-btn"
            disabled={busy || !name.trim()}
            onClick={() => void runAction('rename', { name })}
          >
            Salvar nome
          </button>
          {w && (
            <ProfilePhoto
              workspaceId={w.id}
              name={w.name}
              url={w.avatarUrl}
              reload={reload}
            />
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runAction('create', { name: newName });
            }}
          >
            <label className="field">
              Novo workspace
              <input
                className="workspace-input"
                value={newName}
                maxLength={80}
                placeholder="Nome do novo workspace"
                onChange={(e) => setNewName(e.target.value)}
              />
            </label>
            <button className="primary-btn" disabled={busy || !newName.trim()}>
              Criar workspace
            </button>
          </form>
            </>
          )}
          {error && <output aria-live="polite">{error}</output>}
        </DialogContent>
      </Dialog>
    </>
  );
}
