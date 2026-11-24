'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck2,
  Download,
  ImagePlus,
  LoaderCircle,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import type { Action, Brand, State } from '@/lib/types';
import { today } from '@/lib/types';
import { HUB_URL } from '@/lib/oxyhub';

/**
 * Criar: o jeito simples de fazer post e carrossel.
 * 1. O Diretor de Criação conversa e propõe conceitos com o texto de cada lâmina.
 * 2. A peça aparece na prévia 1080×1350 e muda na hora a cada ajuste (texto, cor, imagem).
 * 3. "Salvar e enviar" gera os PNGs, guarda na biblioteca da marca, cria a peça com a data
 *    (aparece no OxyCalendar) e, se a marca estiver ligada a um cliente, cria a publicação no
 *    OxyPlanning já para aprovação.
 */

type Align = 'top' | 'center' | 'bottom';
type TextTone = 'auto' | 'light' | 'dark';
type Slide = { title: string; text: string; bg: string; image: string; dim: number; align: Align; tone: TextTone };
type Piece = { name: string; idea: string; slides: { title: string; text: string }[]; caption: string; hashtags: string[]; imagePrompt: string };
type Msg = { role: 'user' | 'director'; text: string; concepts?: Piece[] };

const W = 1080;
const H = 1350;
const PAD = 96;

/** Cores da marca a partir do texto livre do cadastro (#hex); sem cores, a paleta Oxy. */
function brandColors(b?: Brand) {
  const found = (b?.colors || '').match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) || [];
  const list = [...new Set(found.map((c) => c.toLowerCase()))];
  return list.length ? [...list, '#ffffff', '#0f1540'].slice(0, 8) : ['#4700ff', '#0f1540', '#2563eb', '#7c3aed', '#22d3ee', '#ffffff'];
}
function isLight(hex: string) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150;
}
function textColor(s: Slide) {
  if (s.tone === 'light') return '#ffffff';
  if (s.tone === 'dark') return '#0f1540';
  if (s.image) return '#ffffff';
  return isLight(s.bg) ? '#0f1540' : '#ffffff';
}
const blank = (bg: string): Slide => ({ title: '', text: '', bg, image: '', dim: 35, align: 'bottom', tone: 'auto' });

/* ---------------- prévia (HTML) ---------------- */

function SlideArt({ s, logo, index, total }: { s: Slide; logo: string; index: number; total: number }) {
  const color = textColor(s);
  const justify = s.align === 'top' ? 'flex-start' : s.align === 'center' ? 'center' : 'flex-end';
  return (
    <div style={{ width: W, height: H, position: 'relative', overflow: 'hidden', background: s.bg, fontFamily: 'inherit' }}>
      {s.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : null}
      {s.image ? <div style={{ position: 'absolute', inset: 0, background: `rgba(0,0,0,${s.dim / 100})` }} /> : null}
      <div style={{ position: 'absolute', inset: PAD, display: 'flex', flexDirection: 'column', justifyContent: justify, gap: 28, color }}>
        {s.title ? <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.02em', whiteSpace: 'pre-wrap' }}>{s.title}</div> : null}
        {s.text ? <div style={{ fontSize: 40, fontWeight: 400, lineHeight: 1.35, whiteSpace: 'pre-wrap', opacity: 0.92 }}>{s.text}</div> : null}
      </div>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" style={{ position: 'absolute', left: PAD, ...(s.align === 'bottom' ? { top: 64 } : { bottom: 64 }), height: 64, width: 'auto', objectFit: 'contain' }} />
      ) : null}
      {total > 1 ? (
        <div style={{ position: 'absolute', right: PAD, ...(s.align === 'bottom' ? { top: 72 } : { bottom: 72 }), fontSize: 30, fontWeight: 600, color, opacity: 0.8 }}>
          {index + 1}/{total}
        </div>
      ) : null}
    </div>
  );
}

/** A arte em tamanho real, reduzida para caber na largura disponível. */
function Scaled({ children, width }: { children: React.ReactNode; width: number }) {
  const scale = width / W;
  return (
    <div style={{ width, height: H * scale, position: 'relative', overflow: 'hidden', borderRadius: 18, boxShadow: '0 18px 40px -22px rgb(15 21 64 / .45)' }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', top: 0, left: 0 }}>{children}</div>
    </div>
  );
}

/* ---------------- exportação (canvas) ---------------- */

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível carregar uma imagem da peça.'));
    img.src = src;
  });
}
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? line + ' ' + word : word;
      if (ctx.measureText(next).width > max && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}
async function renderPng(s: Slide, logo: string, index: number, total: number, family: string) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = s.bg;
  ctx.fillRect(0, 0, W, H);
  if (s.image) {
    const img = await loadImage(s.image);
    const r = Math.max(W / img.width, H / img.height);
    const w = img.width * r,
      h = img.height * r;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    ctx.fillStyle = `rgba(0,0,0,${s.dim / 100})`;
    ctx.fillRect(0, 0, W, H);
  }
  const color = textColor(s);
  const maxW = W - PAD * 2;
  ctx.textBaseline = 'top';
  ctx.font = `700 84px ${family}`;
  const titleLines = s.title ? wrap(ctx, s.title, maxW) : [];
  ctx.font = `400 40px ${family}`;
  const textLines = s.text ? wrap(ctx, s.text, maxW) : [];
  const titleH = titleLines.length * 84 * 1.05;
  const textH = textLines.length * 40 * 1.35;
  const block = titleH + textH + (titleLines.length && textLines.length ? 28 : 0);
  let y = s.align === 'top' ? PAD : s.align === 'center' ? (H - block) / 2 : H - PAD - block;
  ctx.fillStyle = color;
  ctx.font = `700 84px ${family}`;
  for (const l of titleLines) {
    ctx.fillText(l, PAD, y);
    y += 84 * 1.05;
  }
  if (titleLines.length && textLines.length) y += 28;
  ctx.font = `400 40px ${family}`;
  ctx.globalAlpha = 0.92;
  for (const l of textLines) {
    ctx.fillText(l, PAD, y);
    y += 40 * 1.35;
  }
  ctx.globalAlpha = 1;
  const corner = s.align === 'bottom' ? 'top' : 'bottom';
  if (logo) {
    const img = await loadImage(logo).catch(() => null);
    if (img) {
      const h = 64,
        w = (img.width / img.height) * h;
      ctx.drawImage(img, PAD, corner === 'top' ? 64 : H - 64 - h, w, h);
    }
  }
  if (total > 1) {
    ctx.font = `600 30px ${family}`;
    ctx.globalAlpha = 0.8;
    ctx.textAlign = 'right';
    ctx.textBaseline = corner === 'top' ? 'top' : 'bottom';
    ctx.fillText(`${index + 1}/${total}`, W - PAD, corner === 'top' ? 72 : H - 72);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível gerar o PNG.'))), 'image/png'));
}

/* ---------------- tela ---------------- */

export function Create({ state, act, reload }: { state: State; act: Action; reload: () => Promise<void> }) {
  const brands = state.brands;
  const [brandId, setBrandId] = useState(() => {
    try {
      const saved = localStorage.getItem('oc.create.brand') || '';
      return brands.some((b) => b.id === saved) ? saved : brands[0]?.id || '';
    } catch {
      return brands[0]?.id || '';
    }
  });
  const brand = brands.find((b) => b.id === brandId);
  const palette = useMemo(() => brandColors(brand), [brand]);
  const logo = useMemo(
    () => state.assets.find((a) => a.brandId === brandId && a.category === 'logo' && /^image\//.test(a.mime))?.url || '',
    [state.assets, brandId],
  );
  const images = useMemo(
    () => state.assets.filter((a) => a.brandId === brandId && /^image\/(png|jpe?g|webp)/.test(a.mime) && a.category !== 'logo').slice(0, 60),
    [state.assets, brandId],
  );

  const [format, setFormat] = useState<'post' | 'carousel'>('post');
  const [count, setCount] = useState(5);
  const [slides, setSlides] = useState<Slide[]>([blank(palette[0])]);
  const [current, setCurrent] = useState(0);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [title, setTitle] = useState('');
  const [imagePrompt, setImagePrompt] = useState('');
  const [date, setDate] = useState(today());
  const [hasDraft, setHasDraft] = useState(false);

  const [chat, setChat] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState<'' | 'image' | 'save' | 'download' | 'upload'>('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const chatEnd = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const box = useRef<HTMLDivElement>(null);
  const [previewW, setPreviewW] = useState(420);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setPreviewW(Math.max(240, Math.min(520, Math.floor(e.contentRect.width)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => chatEnd.current?.scrollIntoView({ block: 'nearest' }), [chat, thinking]);
  useEffect(() => {
    try {
      localStorage.setItem('oc.create.brand', brandId);
    } catch {
      /* ignora */
    }
  }, [brandId]);

  const total = slides.length;
  const s = slides[Math.min(current, total - 1)];
  const patch = (p: Partial<Slide>) => setSlides((all) => all.map((x, i) => (i === current ? { ...x, ...p } : x)));

  // Mudou o formato ou a quantidade: ajusta o número de lâminas, mantendo o que já foi escrito.
  const resize = (n: number) =>
    setSlides((all) => {
      const next = all.slice(0, n);
      while (next.length < n) next.push({ ...blank(all[all.length - 1]?.bg || palette[0]), image: all[all.length - 1]?.image || '', dim: all[all.length - 1]?.dim ?? 35 });
      return next;
    });
  useEffect(() => {
    resize(format === 'post' ? 1 : count);
    setCurrent((c) => Math.min(c, (format === 'post' ? 1 : count) - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, count]);

  const applyPiece = (p: Piece) => {
    setSlides((all) =>
      p.slides.map((t, i) => ({ ...(all[i] || blank(all[0]?.bg || palette[0])), title: t.title, text: t.text, ...(i > 0 && !all[i] ? { image: all[0]?.image || '' } : {}) })),
    );
    setCaption(p.caption);
    setHashtags(p.hashtags.join(' '));
    setTitle((t) => t || p.name);
    setImagePrompt(p.imagePrompt);
    setHasDraft(true);
    setCurrent(0);
  };
  const draftNow = (): Piece => ({
    name: title,
    idea: '',
    slides: slides.map((x) => ({ title: x.title, text: x.text })),
    caption,
    hashtags: hashtags.split(/\s+/).filter(Boolean),
    imagePrompt,
  });

  const ask = async (text: string) => {
    const msg = text.trim();
    if (!msg || thinking) return;
    if (!brand) return setError('Escolha a marca primeiro.');
    const next: Msg[] = [...chat, { role: 'user', text: msg }];
    setChat(next);
    setInput('');
    setThinking(true);
    setError('');
    try {
      const r = await fetch('/api/openai/studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'director',
          brandId,
          format,
          slides: format === 'post' ? 1 : count,
          messages: next.map((m) => ({ role: m.role, text: m.text })),
          draft: hasDraft ? draftNow() : null,
        }),
      });
      const j = (await r.json()) as { reply?: string; concepts?: Piece[]; draft?: Piece | null; error?: string };
      if (!r.ok) throw new Error(j.error || 'O Diretor de Criação não respondeu.');
      setChat([...next, { role: 'director', text: j.reply || '', concepts: j.concepts?.length ? j.concepts : undefined }]);
      if (j.draft) applyPiece(j.draft);
    } catch (e) {
      setChat(next);
      setError(e instanceof Error ? e.message : 'O Diretor de Criação não respondeu.');
    } finally {
      setThinking(false);
    }
  };

  const generateImage = async () => {
    const prompt = (imagePrompt || s.title || title).trim();
    if (!prompt) return setError('Descreva a imagem que você quer no fundo.');
    setBusy('image');
    setError('');
    try {
      const r = await fetch('/api/openai/studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'image', brandId, prompt }),
      });
      const j = (await r.json()) as { url?: string; error?: string };
      if (!r.ok || !j.url) throw new Error(j.error || 'Não foi possível gerar a imagem.');
      patch({ image: j.url, tone: 'auto' });
      await reload().catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível gerar a imagem.');
    } finally {
      setBusy('');
    }
  };

  const uploadImage = async (file: File) => {
    setBusy('upload');
    setError('');
    try {
      const form = new FormData();
      form.append('brandId', brandId);
      form.append('file', file);
      form.append('category', 'visual_reference');
      form.append('name', ('Criar · ' + file.name).slice(0, 200));
      const r = await fetch('/api/assets', { method: 'POST', body: form });
      const j = (await r.json()) as { id?: string; error?: string };
      if (!r.ok || !j.id) throw new Error(j.error || 'Falha no envio da imagem.');
      patch({ image: `/api/assets/${j.id}` });
      await reload().catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha no envio da imagem.');
    } finally {
      setBusy('');
    }
  };

  const family = useCallback(() => {
    const f = getComputedStyle(document.querySelector('.create-art') || document.body).fontFamily || 'Saira, sans-serif';
    return f;
  }, []);
  const pngs = async () => {
    const f = family();
    await Promise.all([document.fonts.load(`700 84px ${f}`), document.fonts.load(`400 40px ${f}`)]).catch(() => undefined);
    const out: Blob[] = [];
    for (let i = 0; i < slides.length; i++) out.push(await renderPng(slides[i], logo, i, slides.length, f));
    return out;
  };

  const download = async () => {
    setBusy('download');
    setError('');
    try {
      const files = await pngs();
      files.forEach((b, i) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = `${(title || 'post').replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}${files.length > 1 ? '-' + (i + 1) : ''}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível baixar.');
    } finally {
      setBusy('');
    }
  };

  const tagsList = hashtags
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((t) => '#' + t.replace(/^#+/, ''));
  const empty = slides.every((x) => !x.title.trim() && !x.text.trim() && !x.image);

  const save = async () => {
    setError('');
    setDone('');
    if (!brand) return setError('Escolha a marca.');
    if (!title.trim()) return setError('Dê um nome para a peça.');
    if (empty) return setError('A peça está vazia: escreva o texto ou peça ao Diretor de Criação.');
    if (!caption.trim()) return setError('Escreva a legenda.');
    if (tagsList.length !== 5) return setError('Use exatamente 5 hashtags.');
    setBusy('save');
    try {
      const files = await pngs();
      const ids: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const form = new FormData();
        form.append('brandId', brandId);
        form.append('file', new File([files[i]], `${title.slice(0, 60)}${files.length > 1 ? ' ' + (i + 1) : ''}.png`, { type: 'image/png' }));
        form.append('category', 'delivery');
        form.append('name', `${title.slice(0, 120)}${files.length > 1 ? ` · lâmina ${i + 1}` : ''}`);
        const r = await fetch('/api/assets', { method: 'POST', body: form });
        const j = (await r.json()) as { id?: string; error?: string };
        if (!r.ok || !j.id) throw new Error(j.error || 'Falha ao guardar a arte.');
        ids.push(j.id);
      }
      const id = crypto.randomUUID();
      await act('createExternal', {
        id,
        brandId,
        title: title.trim(),
        date,
        format: files.length > 1 ? 'Carrossel' : 'Feed',
        brief: chat.filter((m) => m.role === 'user').map((m) => m.text).join('\n').slice(0, 2000),
        headline: slides[0].title,
        copy: slides.map((x, i) => (files.length > 1 ? `${i + 1}. ` : '') + [x.title, x.text].filter(Boolean).join(' — ')).join('\n'),
        caption,
        hashtags: tagsList,
        media: ids,
        change: 'Criado no editor Criar',
      });
      // Marca ligada a um cliente do OxyPlanning: a publicação nasce lá, já para aprovação.
      const r = await fetch('/api/openai/studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'planning', contentId: id }),
      });
      const j = (await r.json().catch(() => ({}))) as { planning?: string | null; error?: string };
      const when = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
      if (!r.ok)
        setDone(`Peça salva para ${when} e já está no OxyCalendar. Não foi para o OxyPlanning: ${j.error || 'falha no envio'}. Envie pela Produção.`);
      else if (j.planning)
        setDone(`Peça salva para ${when}: está no OxyCalendar e foi para aprovação de ${j.planning === 'ja_enviada' ? 'o cliente' : j.planning} no OxyPlanning.`);
      else setDone(`Peça salva para ${when} e já está no OxyCalendar, aguardando aprovação. A marca não está ligada a um cliente do OxyPlanning.`);
      await reload().catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally {
      setBusy('');
    }
  };

  const reset = () => {
    setSlides([blank(palette[0])]);
    setFormat('post');
    setCaption('');
    setHashtags('');
    setTitle('');
    setImagePrompt('');
    setHasDraft(false);
    setChat([]);
    setDone('');
    setError('');
    setCurrent(0);
  };

  if (!brands.length) return null;

  const pill = (on: boolean) =>
    'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold transition-colors ' +
    (on ? 'bg-white text-[#262b36] shadow-[0_0_0_.5px_rgb(15_21_64/.08),0_4px_10px_-6px_rgb(15_21_64/.18)]' : 'text-[#4a505c] hover:bg-[rgb(15_21_64/.05)]');
  const field = 'w-full rounded-[12px] border border-[rgb(15_21_64/.08)] bg-white px-3 py-2 text-[14px] text-[#262b36] outline-none focus:border-[#4700ff]';
  const label = 'mb-1 block text-[13px] font-semibold text-[#4a505c]';

  return (
    <div className="create-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{brand?.name || 'OxyStudio'}</p>
          <h1>Criar</h1>
          <p>Converse com o Diretor de Criação, ajuste a arte na prévia e salve com a data. A peça entra no OxyCalendar e vai para aprovação.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Marca" value={brandId} onChange={(e) => (setBrandId(e.target.value), reset())} className="h-11 rounded-full border border-[rgb(15_21_64/.08)] bg-white px-4 text-[14px] font-semibold">
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button type="button" className="outline-btn" onClick={reset}>
            <Plus size={18} /> Nova peça
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="notice error mb-4">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="notice mb-4 flex flex-wrap items-center gap-3">
          <CalendarCheck2 size={18} /> {done}
          <a className="font-semibold text-[#4700ff] hover:underline" href={`${HUB_URL}/calendario?data=${date}`}>
            Ver no OxyCalendar
          </a>
        </p>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)_minmax(280px,340px)]">
        {/* Diretor de Criação */}
        <section className="glass flex min-h-[420px] flex-col rounded-[22px] p-4 xl:h-[calc(100svh-240px)]">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <Sparkles size={18} className="text-[#7c3aed]" /> Diretor de Criação
          </h2>
          <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
            {!chat.length ? (
              <div className="rounded-[14px] bg-[rgb(15_21_64/.03)] p-3 text-[13.5px] leading-relaxed text-[#4a505c]">
                Diga o que o post precisa comunicar. Ex.: <i>“Promoção de Black Friday com 20% em todos os planos, até domingo”</i>. Eu proponho conceitos com o texto de cada lâmina.
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {['Lançamento de produto', 'Dica rápida para o público', 'Bastidores da equipe', 'Data comemorativa'].map((t) => (
                    <button key={t} type="button" className="rounded-full bg-white px-3 py-1 text-[12.5px] font-semibold text-[#4a505c] hover:text-[#262b36]" onClick={() => setInput(t + ': ')}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {chat.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'ml-6 rounded-[14px] bg-[#4700ff] px-3 py-2 text-[14px] text-white' : 'mr-2 text-[14px] leading-relaxed text-[#262b36]'}>
                {m.text}
                {m.concepts ? (
                  <div className="mt-2 space-y-2">
                    {m.concepts.map((c, k) => (
                      <div key={k} className="rounded-[14px] bg-white p-3 shadow-[0_0_0_.5px_rgb(15_21_64/.08)]">
                        <p className="text-[14px] font-bold">{c.name}</p>
                        <p className="mt-0.5 text-[13px] text-[#737985]">{c.idea}</p>
                        <p className="mt-1.5 text-[13px] text-[#4a505c]">“{c.slides[0]?.title}”{c.slides.length > 1 ? ` + ${c.slides.length - 1} lâminas` : ''}</p>
                        <button type="button" className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full bg-[#4700ff] px-3 text-[13px] font-semibold text-white" onClick={() => applyPiece(c)}>
                          <Wand2 size={14} /> Usar este
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {thinking ? (
              <p className="flex items-center gap-2 text-[13px] text-[#737985]">
                <LoaderCircle size={15} className="animate-spin" /> Pensando no conceito…
              </p>
            ) : null}
            <div ref={chatEnd} />
          </div>
          <form
            className="mt-3 flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(input);
            }}
          >
            <textarea
              aria-label="Mensagem para o Diretor de Criação"
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void ask(input);
                }
              }}
              placeholder={hasDraft ? 'Peça um ajuste: “título mais curto”, “tom mais divertido”…' : 'O que este post precisa comunicar?'}
              className={field + ' resize-none'}
            />
            <button type="submit" disabled={thinking || !input.trim()} aria-label="Enviar" className="grid size-10 shrink-0 place-items-center rounded-full bg-[#4700ff] text-white disabled:opacity-40">
              <Send size={17} />
            </button>
          </form>
        </section>

        {/* Prévia ao vivo */}
        <section className="flex flex-col items-center gap-3">
          <div className="flex rounded-full bg-[rgb(15_21_64/.05)] p-1" role="tablist" aria-label="Formato">
            <button type="button" role="tab" aria-selected={format === 'post'} className={pill(format === 'post')} onClick={() => setFormat('post')}>
              Post
            </button>
            <button type="button" role="tab" aria-selected={format === 'carousel'} className={pill(format === 'carousel')} onClick={() => setFormat('carousel')}>
              Carrossel
            </button>
            {format === 'carousel' ? (
              <select aria-label="Número de lâminas" value={count} onChange={(e) => setCount(Number(e.target.value))} className="ml-1 h-9 rounded-full bg-white px-2 text-[13.5px] font-semibold">
                {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} lâminas
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <div ref={box} className="create-art flex w-full justify-center">
            <Scaled width={previewW}>
              <SlideArt s={s} logo={logo} index={current} total={total} />
            </Scaled>
          </div>
          {total > 1 ? (
            <div className="flex w-full max-w-[560px] items-center gap-2">
              <button type="button" aria-label="Lâmina anterior" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)} className="glass-btn grid size-9 shrink-0 place-items-center rounded-full disabled:opacity-40">
                <ArrowLeft size={16} />
              </button>
              <div className="flex flex-1 gap-2 overflow-x-auto py-1">
                {slides.map((x, i) => (
                  <button key={i} type="button" aria-label={`Lâmina ${i + 1}`} aria-current={i === current} onClick={() => setCurrent(i)} className={'shrink-0 rounded-[8px] ' + (i === current ? 'ring-2 ring-[#4700ff] ring-offset-2' : 'opacity-80 hover:opacity-100')}>
                    <Scaled width={56}>
                      <SlideArt s={x} logo={logo} index={i} total={total} />
                    </Scaled>
                  </button>
                ))}
              </div>
              <button type="button" aria-label="Próxima lâmina" disabled={current === total - 1} onClick={() => setCurrent((c) => c + 1)} className="glass-btn grid size-9 shrink-0 place-items-center rounded-full disabled:opacity-40">
                <ArrowRight size={16} />
              </button>
            </div>
          ) : null}
          {!logo ? <p className="text-[12.5px] text-[#737985]">Sem logo na arte: envie o logotipo da marca em Marcas → arquivos.</p> : null}
        </section>

        {/* Ajustes */}
        <section className="glass space-y-4 rounded-[22px] p-4">
          <h2 className="text-[15px] font-bold">{total > 1 ? `Lâmina ${current + 1} de ${total}` : 'Arte'}</h2>
          <label className="block">
            <span className={label}>Título</span>
            <textarea rows={2} value={s.title} onChange={(e) => patch({ title: e.target.value })} className={field + ' resize-none'} maxLength={140} />
          </label>
          <label className="block">
            <span className={label}>Texto</span>
            <textarea rows={3} value={s.text} onChange={(e) => patch({ text: e.target.value })} className={field + ' resize-none'} maxLength={400} />
          </label>
          <div>
            <span className={label}>Posição do texto</span>
            <div className="flex rounded-full bg-[rgb(15_21_64/.05)] p-1">
              {(['top', 'center', 'bottom'] as Align[]).map((a) => (
                <button key={a} type="button" className={pill(s.align === a) + ' flex-1 justify-center'} onClick={() => patch({ align: a })}>
                  {a === 'top' ? 'Em cima' : a === 'center' ? 'Centro' : 'Embaixo'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className={label}>Fundo</span>
            <div className="flex flex-wrap items-center gap-2">
              {palette.map((c) => (
                <button key={c} type="button" aria-label={`Cor ${c}`} onClick={() => patch({ bg: c, image: '' })} className={'size-8 rounded-full ' + (!s.image && s.bg === c ? 'ring-2 ring-[#4700ff] ring-offset-2' : 'shadow-[0_0_0_1px_rgb(15_21_64/.12)]')} style={{ background: c }} />
              ))}
              <input type="color" aria-label="Outra cor" value={s.bg} onChange={(e) => patch({ bg: e.target.value, image: '' })} className="size-8 cursor-pointer rounded-full border-0 bg-transparent p-0" />
            </div>
          </div>
          <div className="space-y-2">
            <span className={label}>Imagem de fundo</span>
            <textarea rows={2} value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} placeholder="Descreva a imagem (sem texto): ex. mesa de café da manhã com luz natural" className={field + ' resize-none'} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className="create-btn" disabled={!!busy} onClick={() => void generateImage()}>
                {busy === 'image' ? <LoaderCircle size={16} className="animate-spin" /> : <ImagePlus size={16} />} {busy === 'image' ? 'Gerando…' : 'Gerar com IA'}
              </button>
              <button type="button" className="outline-btn" disabled={!!busy} onClick={() => fileInput.current?.click()}>
                {busy === 'upload' ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />} Enviar
              </button>
              {s.image ? (
                <button type="button" className="outline-btn" onClick={() => patch({ image: '' })} aria-label="Tirar imagem">
                  <Trash2 size={16} />
                </button>
              ) : null}
              <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && void uploadImage(e.target.files[0])} />
            </div>
            {images.length ? (
              <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Imagens da biblioteca">
                {images.map((a) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={a.id} src={a.url} alt={a.name} title={a.name} onClick={() => patch({ image: a.url })} className={'size-12 shrink-0 cursor-pointer rounded-[8px] object-cover ' + (s.image === a.url ? 'ring-2 ring-[#4700ff]' : '')} />
                ))}
              </div>
            ) : null}
            {s.image ? (
              <label className="block">
                <span className={label}>Escurecer a imagem: {s.dim}%</span>
                <input type="range" min={0} max={70} value={s.dim} onChange={(e) => patch({ dim: Number(e.target.value) })} className="w-full accent-[#4700ff]" />
              </label>
            ) : null}
            {total > 1 ? (
              <button type="button" className="text-[13px] font-semibold text-[#4700ff] hover:underline" onClick={() => setSlides((all) => all.map((x) => ({ ...x, bg: s.bg, image: s.image, dim: s.dim })))}>
                Usar este fundo em todas as lâminas
              </button>
            ) : null}
          </div>
          <div>
            <span className={label}>Cor do texto</span>
            <div className="flex rounded-full bg-[rgb(15_21_64/.05)] p-1">
              {(['auto', 'light', 'dark'] as TextTone[]).map((t) => (
                <button key={t} type="button" className={pill(s.tone === t) + ' flex-1 justify-center'} onClick={() => patch({ tone: t })}>
                  {t === 'auto' ? 'Automática' : t === 'light' ? 'Clara' : 'Escura'}
                </button>
              ))}
            </div>
          </div>

          <hr className="border-[rgb(15_21_64/.06)]" />
          <label className="block">
            <span className={label}>Nome da peça</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} maxLength={200} placeholder="Ex.: Black Friday 20%" />
          </label>
          <label className="block">
            <span className={label}>Legenda</span>
            <textarea rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} className={field + ' resize-y'} />
          </label>
          <label className="block">
            <span className={label}>Hashtags ({tagsList.length}/5)</span>
            <input value={hashtags} onChange={(e) => setHashtags(e.target.value)} className={field} placeholder="#marca #tema …" />
          </label>
          <label className="block">
            <span className={label}>Data de publicação</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </label>
          <div className="flex flex-col gap-2">
            <button type="button" className="create-btn justify-center" disabled={!!busy} onClick={() => void save()}>
              {busy === 'save' ? <LoaderCircle size={18} className="animate-spin" /> : <CalendarCheck2 size={18} />} {busy === 'save' ? 'Salvando…' : 'Salvar e enviar para aprovação'}
            </button>
            <button type="button" className="outline-btn justify-center" disabled={!!busy || empty} onClick={() => void download()}>
              {busy === 'download' ? <LoaderCircle size={18} className="animate-spin" /> : <Download size={18} />} Baixar PNG
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
