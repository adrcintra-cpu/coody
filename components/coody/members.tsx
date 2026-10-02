'use client';
import { useEffect, useState } from 'react';
import { Copy, UserPlus, Link2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { roleHelp, roleLabels, type Role } from '@/lib/permissions';

type Member = {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: 'invited' | 'active' | 'disabled';
  workspaceIds: string[];
  inviteExpiresAt: string;
};
type Model = {
  owner: string;
  workspaces: { id: string; name: string }[];
  members: Member[];
};
const roles: Role[] = ['ADMINISTRADOR', 'EDITOR', 'APROVADOR'];
const statusLabels = {
  invited: 'Convite pendente',
  active: 'Ativo',
  disabled: 'Suspenso',
};

/** Configurações › Pessoas (administrators only). */
export function Members({ currentWorkspaceId }: { currentWorkspaceId?: string }) {
  const [model, setModel] = useState<Model | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  // Last generated invite link, shown once to be copied and sent.
  const [link, setLink] = useState<{ name: string; url: string; days: number } | null>(null);
  const [form, setForm] = useState<{
    name: string;
    email: string;
    role: Role;
    workspaceIds: string[];
  }>({ name: '', email: '', role: 'EDITOR', workspaceIds: currentWorkspaceId ? [currentWorkspaceId] : [] });
  const [editing, setEditing] = useState<Member | null>(null);
  async function load() {
    const r = await fetch('/api/members', { cache: 'no-store' });
    const d = (await r.json()) as Model & { error?: string };
    if (!r.ok) throw new Error(d.error);
    setModel(d);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  async function post(body: Record<string, unknown>, name = '') {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const r = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = (await r.json()) as { error?: string; message?: string; link?: string; days?: number };
      if (!r.ok) throw new Error(d.error);
      if (d.link) setLink({ name, url: d.link, days: d.days || 7 });
      if (d.message) setMessage(d.message);
      await load();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const workspacePicker = (
    value: string[],
    onChange: (ids: string[]) => void,
  ) => (
    <fieldset className="member-workspaces" disabled={busy}>
      <legend>Workspaces liberados</legend>
      {model?.workspaces.map((w) => (
        <label key={w.id} className="check-label">
          <input
            type="checkbox"
            checked={value.includes(w.id)}
            onChange={(e) =>
              onChange(e.target.checked ? [...value, w.id] : value.filter((x) => x !== w.id))
            }
          />
          {w.name}
        </label>
      ))}
    </fieldset>
  );
  const rolePicker = (value: Role, onChange: (r: Role) => void) => (
    <fieldset className="member-roles" disabled={busy}>
      <legend>Perfil de acesso</legend>
      {roles.map((r) => (
        <label key={r} className="check-label">
          <input type="radio" checked={value === r} onChange={() => onChange(r)} />
          <span>
            <strong>{roleLabels[r]}</strong>
            <small className="muted"> · {roleHelp[r]}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
  const names = (ids: string[]) =>
    ids.map((id) => model?.workspaces.find((w) => w.id === id)?.name).filter(Boolean).join(', ') || '—';
  return (
    <section className="panel members-panel">
      <h2>Pessoas</h2>
      <p className="muted">
        Convide a equipe e os clientes. Cada pessoa vê só os workspaces que você
        liberar, com o perfil escolhido.
      </p>
      {error && <p className="notice error" role="alert">{error}</p>}
      {message && <output className="notice">{message}</output>}
      {link && (
        <div className="notice invite-link" role="status">
          <p>
            <strong>Link de convite para {link.name || 'a pessoa'}</strong> (vale{' '}
            {link.days} dias e só pode ser usado uma vez). Envie por WhatsApp ou
            e-mail; a pessoa cria a própria senha.
          </p>
          <div className="invite-link-row">
            <Input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="outline-btn"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link.url);
                  setMessage('Link copiado.');
                } catch {
                  setMessage('Selecione o link e copie com Cmd+C.');
                }
              }}
            >
              <Copy size={15} /> Copiar
            </button>
          </div>
        </div>
      )}
      <div className="member-list">
        <div className="member-row owner">
          <div>
            <strong>Você (administrador principal)</strong>
            <small className="muted">{model?.owner}</small>
          </div>
          <span className="member-badge">Administrador · todos os workspaces</span>
        </div>
        {model?.members.map((m) => (
          <div className={'member-row ' + m.status} key={m.id}>
            <div>
              <strong>{m.name}</strong>
              <small className="muted">
                {m.email} · {roleLabels[m.role]} · {names(m.workspaceIds)}
              </small>
              <small className={m.status === 'active' ? 'success' : 'muted'}>
                {statusLabels[m.status]}
                {m.status === 'invited' && m.inviteExpiresAt
                  ? ' · link válido até ' + new Date(m.inviteExpiresAt).toLocaleDateString('pt-BR')
                  : m.status === 'invited'
                    ? ' · link expirado'
                    : ''}
              </small>
            </div>
            <div className="member-actions">
              <button type="button" className="text-btn" disabled={busy} onClick={() => setEditing(m)}>
                Editar
              </button>
              {m.status !== 'disabled' && (
                <button
                  type="button"
                  className="text-btn"
                  disabled={busy}
                  title={m.status === 'active' ? 'Gera um link para a pessoa definir uma nova senha.' : ''}
                  onClick={() => post({ action: 'relink', id: m.id }, m.name)}
                >
                  <Link2 size={14} /> {m.status === 'active' ? 'Link de nova senha' : 'Novo link'}
                </button>
              )}
              {m.status === 'disabled' ? (
                <button type="button" className="text-btn" disabled={busy} onClick={() => post({ action: 'enable', id: m.id })}>
                  Reativar
                </button>
              ) : (
                <button type="button" className="text-btn" disabled={busy} onClick={() => post({ action: 'disable', id: m.id })}>
                  Suspender
                </button>
              )}
              <button
                type="button"
                className="text-btn danger"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Remover ${m.name} do COODY? O acesso termina na hora.`))
                    void post({ action: 'remove', id: m.id });
                }}
              >
                Remover
              </button>
            </div>
            {editing?.id === m.id && (
              <form
                className="member-edit"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (await post({ action: 'update', id: m.id, name: editing.name, role: editing.role, workspaceIds: editing.workspaceIds }))
                    setEditing(null);
                }}
              >
                <label className="field">
                  <span>Nome</span>
                  <Input value={editing.name} maxLength={120} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </label>
                {rolePicker(editing.role, (role) => setEditing({ ...editing, role }))}
                {workspacePicker(editing.workspaceIds, (workspaceIds) => setEditing({ ...editing, workspaceIds }))}
                <p className="form-hint">Ao salvar, a pessoa precisa entrar de novo.</p>
                <div className="form-actions">
                  <button type="button" className="outline-btn" onClick={() => setEditing(null)}>
                    Cancelar
                  </button>
                  <button className="create-btn" disabled={busy || !editing.workspaceIds.length}>
                    Salvar acesso
                  </button>
                </div>
              </form>
            )}
          </div>
        ))}
      </div>
      <form
        className="member-invite"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await post({ action: 'invite', ...form }, form.name))
            setForm({ ...form, name: '', email: '' });
        }}
      >
        <h3>
          <UserPlus size={16} /> Convidar pessoa
        </h3>
        <div className="form-grid">
          <label className="field">
            <span>Nome</span>
            <Input required maxLength={120} value={form.name} disabled={busy} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="field">
            <span>E-mail</span>
            <Input required type="email" maxLength={200} value={form.email} disabled={busy} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
        </div>
        {rolePicker(form.role, (role) => setForm({ ...form, role }))}
        {workspacePicker(form.workspaceIds, (workspaceIds) => setForm({ ...form, workspaceIds }))}
        <button className="create-btn" disabled={busy || !form.workspaceIds.length}>
          {busy ? 'Gerando…' : 'Gerar link de convite'}
        </button>
      </form>
    </section>
  );
}
