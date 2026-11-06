'use client';
import { AuthShell } from './login';
import { useEffect, useState, type SyntheticEvent } from 'react';

/** #convite?token=… : the invited person sets a password and enters. */
export function AcceptInvite({ token }: { token: string }) {
  const [info, setInfo] = useState<{ name: string; email: string } | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch('/api/invite?token=' + encodeURIComponent(token), { cache: 'no-store' })
      .then(async (r) => {
        const d = (await r.json()) as { name?: string; email?: string; error?: string };
        if (!r.ok) throw new Error(d.error);
        setInfo({ name: d.name || '', email: d.email || '' });
        setName(d.name || '');
      })
      .catch((e) => setError(e.message || 'Convite inválido.'))
      .finally(() => setLoading(false));
  }, [token]);
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') || '');
    if (password !== form.get('confirm')) {
      setError('As senhas não conferem.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, name }),
      });
      const d = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(d.error || 'Não foi possível ativar o acesso.');
      window.location.replace('/#Dashboard');
      window.location.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell
      title={loading ? 'Abrindo convite…' : !info ? 'Convite indisponível' : 'Crie seu acesso ao COODY'}
      lead={
        loading
          ? 'Só um instante.'
          : !info
            ? 'Este link não está mais ativo.'
            : `Convite para ${info.email}. Escolha uma senha para entrar.`
      }
    >
      {loading ? null : !info ? (
        <div className="auth-card">
          <p className="auth-error" role="alert">
            {error}
          </p>
          <a className="create-btn auth-submit" href="/">
            Ir para o login
          </a>
        </div>
      ) : (
        <form onSubmit={submit} className="auth-card">
          <label className="auth-field">
            <span>Seu nome</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required className="auth-input" />
          </label>
          <input type="email" name="username" autoComplete="username" value={info.email} readOnly hidden />
          <label className="auth-field">
            <span>Senha (mínimo 8 caracteres)</span>
            <input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={256} required className="auth-input" />
          </label>
          <label className="auth-field">
            <span>Confirme a senha</span>
            <input name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={256} required className="auth-input" />
          </label>
          {error && (
            <p className="auth-error" role="alert">
              {error}
            </p>
          )}
          <button disabled={busy} className="create-btn auth-submit">
            {busy ? 'Ativando…' : 'Criar senha e entrar'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
