"use client";
import Image from 'next/image';
import { useState, type SyntheticEvent } from 'react';
export function Login() {
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:form.get('email'),password:form.get('password')})});
      const result = await response.json() as {error?: string};
      if (!response.ok) throw new Error(result.error || 'Não foi possível entrar.');
      window.location.reload();
    } catch(error) { setError(error instanceof Error?error.message:'Não foi possível entrar.'); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen flex items-center justify-center p-6"><form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-8 space-y-5"><Image unoptimized width={469} height={172} src="/coody-logo.svg" alt="COODY" className="w-32 mb-8"/><h1 className="text-xl">Acesse seu workspace</h1><label className="block">E-mail<input name="email" type="email" autoComplete="username" required className="mt-2 w-full rounded-lg border p-3"/></label><label className="block">Senha<input name="password" type="password" autoComplete="current-password" maxLength={256} required className="mt-2 w-full rounded-lg border p-3"/></label>{error&&<p role="alert">{error}</p>}<button disabled={busy} className="w-full rounded-lg bg-purple-600 p-3 font-medium disabled:opacity-50">{busy?'Entrando…':'Entrar'}</button></form></main>;
}
