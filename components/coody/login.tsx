"use client";
import Image from 'next/image';
import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { ArrowRight, Eye, EyeOff, LoaderCircle } from 'lucide-react';

/**
 * Background of the Oxyhub access screens: a sphere of dots that turns
 * slowly behind the form (static for people who ask for less motion).
 */
function DotSphere() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Points evenly spread on a sphere (golden-angle spiral).
    const count = 1100;
    const points = Array.from({ length: count }, (_, i) => {
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const theta = i * Math.PI * (3 - Math.sqrt(5));
      return { x: Math.cos(theta) * r, y, z: Math.sin(theta) * r };
    });
    let frame = 0;
    let angle = 0;
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const narrow = w < 760;
      const cx = narrow ? w * 0.5 : w * 0.72;
      const cy = narrow ? h * 0.3 : h * 0.46;
      const radius = Math.min(narrow ? w * 0.6 : w * 0.37, h * 0.44);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const tilt = 0.35;
      for (const p of points) {
        const x = p.x * cos - p.z * sin;
        const z0 = p.x * sin + p.z * cos;
        const y = p.y * Math.cos(tilt) - z0 * Math.sin(tilt);
        const z = p.y * Math.sin(tilt) + z0 * Math.cos(tilt);
        const depth = (z + 1) / 2; // 0 back, 1 front
        // Violet at the top, blue at the bottom; front dots are stronger.
        const t = (y + 1) / 2;
        const red = Math.round(96 + 22 * (1 - t));
        const green = Math.round(118 + 40 * t);
        const blue = Math.round(225 - 10 * t);
        ctx.fillStyle = `rgb(${red} ${green} ${blue} / ${(0.12 + depth * 0.48).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(cx + x * radius, cy + y * radius, 0.6 + depth * 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!still) {
        angle += 0.0016;
        frame = requestAnimationFrame(draw);
      }
    };
    draw();
    const onResize = () => still && draw();
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  return (
    <div className="auth-sphere" aria-hidden>
      <canvas ref={canvas} />
    </div>
  );
}

/** The Oxyhub access screen: logo, a light title, a short line and a glass form. */
export function AuthShell({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <main className="auth-page">
      <DotSphere />
      <div className="auth-column">
        <Image unoptimized width={469} height={172} src="/coody-logo-dark.svg" alt="COODY" className="auth-logo" />
        <h1 className="auth-title">{title}</h1>
        <p className="auth-lead">{lead}</p>
        {children}
        <p className="auth-foot">COODY · acesso restrito à equipe e aos parceiros Oxycom</p>
      </div>
    </main>
  );
}

export function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [forgot, setForgot] = useState(false);
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Não foi possível entrar.');
      window.location.reload();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell
      title="Entrar no COODY"
      lead="Planejamento, criação e aprovação das suas marcas. Depois de entrar, você segue para onde estava."
    >
      <form onSubmit={submit} className="auth-card">
        <label className="auth-field">
          <span>E-mail</span>
          <input
            name="email"
            type="email"
            autoComplete="username"
            required
            placeholder="nome@empresa.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="auth-input"
          />
        </label>
        <div className="auth-field">
          <div className="auth-field-head">
            <label htmlFor="auth-password">Senha</label>
            <button type="button" className="auth-link" onClick={() => setForgot((v) => !v)} aria-expanded={forgot}>
              Esqueci a senha
            </button>
          </div>
          <div className="auth-password">
            <input
              id="auth-password"
              name="password"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              maxLength={256}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="auth-input"
            />
            <button
              type="button"
              className="auth-eye"
              aria-label={show ? 'Esconder senha' : 'Mostrar senha'}
              onClick={() => setShow((v) => !v)}
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        {forgot && (
          <p className="auth-hint" role="status">
            Peça ao administrador do seu workspace um novo link de acesso. Pelo link, você cria uma senha nova.
          </p>
        )}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        <button disabled={busy || !email || !password} className="create-btn auth-submit">
          {busy ? <LoaderCircle size={18} className="animate-spin" /> : null}
          {busy ? 'Entrando…' : 'Entrar'}
          {!busy && <ArrowRight size={18} />}
        </button>
        <p className="auth-note">
          Primeiro acesso? Use o link de convite que você recebeu por e-mail ou WhatsApp.
        </p>
      </form>
    </AuthShell>
  );
}
