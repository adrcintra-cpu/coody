'use client';
import Image from 'next/image';
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
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 space-y-5">
        <Image unoptimized width={469} height={172} src="/coody-logo.svg" alt="COODY" className="w-32 mb-8" />
        {loading ? (
          <p>Abrindo convite…</p>
        ) : !info ? (
          <>
            <h1 className="text-xl">Convite indisponível</h1>
            <p role="alert">{error}</p>
            <a className="underline" href="/">Ir para o login</a>
          </>
        ) : (
          <>
            <h1 className="text-xl">Crie seu acesso ao COODY</h1>
            <p className="text-sm opacity-80">Convite para {info.email}</p>
            <label className="block">
              Seu nome
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required className="mt-2 w-full rounded-lg border p-3" />
            </label>
            <input type="email" name="username" autoComplete="username" value={info.email} readOnly hidden />
            <label className="block">
              Senha (mínimo 8 caracteres)
              <input name="password" type="password" autoComplete="new-password" minLength={8} maxLength={256} required className="mt-2 w-full rounded-lg border p-3" />
            </label>
            <label className="block">
              Confirme a senha
              <input name="confirm" type="password" autoComplete="new-password" minLength={8} maxLength={256} required className="mt-2 w-full rounded-lg border p-3" />
            </label>
            {error && <p role="alert">{error}</p>}
            <button disabled={busy} className="w-full rounded-lg bg-purple-600 p-3 font-medium disabled:opacity-50">
              {busy ? 'Ativando…' : 'Criar senha e entrar'}
            </button>
          </>
        )}
      </form>
    </main>
  );
}
