'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { PautaPicker, pautaBriefing, type Pauta } from './pauta-picker';
import { H, LAYOUTS, W, blankSlide, drawSlide, imageLuma, isLayout, type ArtSlide, type Layout } from './art-layouts';

/**
 * Criar: o jeito simples de fazer post e carrossel.
 * 1. O Diretor de Criação conversa e propõe conceitos com o texto de cada lâmina.
 * 2. A peça aparece na prévia 1080×1350 e muda na hora a cada ajuste (texto, cor, imagem).
 * 3. "Salvar e enviar" gera os PNGs, guarda na biblioteca da marca, cria a peça com a data
 *    (aparece no OxyCalendar) e, se a marca estiver ligada a um cliente, cria a publicação no
 *    OxyPlanning já para aprovação.
 */

type Slide = ArtSlide;
type PieceSlide = { layout: Layout; eyebrow: string; title: string; text: string };
type Piece = { name: string; idea: string; slides: PieceSlide[]; caption: string; hashtags: string[]; imagePrompt: string; subjectPrompt: string };
type Msg = { role: 'user' | 'director'; text: string; concepts?: Piece[] };

/** Cores da marca a partir do texto livre do cadastro (#hex); sem cores, a paleta Oxy. */
function brandColors(b?: Brand) {
  const found = (b?.colors || '').match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) || [];
  const list = [...new Set(found.map((c) => c.toLowerCase()))];
  return list.length ? [...list, '#ffffff', '#0f1540'].slice(0, 8) : ['#4700ff', '#0f1540', '#2563eb', '#7c3aed', '#22d3ee', '#ffffff'];
}
const blank = (bg: string, layout: Layout = 'manchete'): Slide => blankSlide(bg, layout);

/* ---------------- imagens (cache) ---------------- */

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();
function loadImage(src: string) {
  if (!src) return Promise.resolve(null);
  let p = imageCache.get(src);
  if (!p) {
    p = new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
    imageCache.set(src, p);
  }
  return p;
}

const lumaCache = new Map<string, number>();
const logoLuma = (url: string, img: HTMLImageElement) => {
  if (!lumaCache.has(url)) lumaCache.set(url, imageLuma(img));
  return lumaCache.get(url)!;
};

type EnvBase = { family: string; palette: string[]; logos: string[]; signature: string };

/** Desenha a lâmina num canvas (o mesmo desenho da prévia e do PNG). */
async function paint(canvas: HTMLCanvasElement, s: Slide, base: EnvBase, index: number, total: number, preview = false) {
  const [logoImgs, image, subject] = await Promise.all([Promise.all(base.logos.map(loadImage)), loadImage(s.image), loadImage(s.subject)]);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const logos = logoImgs.flatMap((img, i) => (img ? [{ img, url: base.logos[i], luma: logoLuma(base.logos[i], img) }] : []));
  drawSlide(ctx, s, { family: base.family, palette: base.palette, logos, image, subject, preview, index, total, signature: base.signature });
}

/** Prévia ao vivo: canvas em tamanho real (1080×1350), reduzido por CSS. */
function CanvasArt({ s, base, index, total, width }: { s: Slide; base: EnvBase; index: number; total: number; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let alive = true;
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    void paint(off, s, base, index, total, true).then(() => {
      const c = ref.current;
      if (!alive || !c) return;
      c.getContext('2d')?.drawImage(off, 0, 0);
    });
    return () => {
      alive = false;
    };
  }, [s, base, index, total]);
  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      style={{ width, height: (H / W) * width, display: 'block', borderRadius: width > 100 ? 18 : 8, boxShadow: width > 100 ? '0 18px 40px -22px rgb(15 21 64 / .45)' : undefined }}
    />
  );
}

async function renderPng(s: Slide, base: EnvBase, index: number, total: number) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  await paint(canvas, s, base, index, total);
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
  // Todas as versões do logo da marca (positivo, negativo, branco…): a arte escolhe a certa para o fundo
  const logoAssets = useMemo(
    () => state.assets.filter((a) => a.brandId === brandId && a.category === 'logo' && /^image\//.test(a.mime)).slice(0, 8),
    [state.assets, brandId],
  );
  const logos = useMemo(() => logoAssets.map((a) => a.url), [logoAssets]);
  const logo = logos[0] || '';
  const subjects = useMemo(
    () => state.assets.filter((a) => a.brandId === brandId && a.mime === 'image/png' && /^Criar · objeto/.test(a.name)).slice(0, 30),
    [state.assets, brandId],
  );
  // Produtos: fotos de produto primeiro; peças prontas e imagens de IA ficam de fora
  const products = useMemo(
    () =>
      state.assets
        .filter((a) => a.brandId === brandId && /^image\/(png|jpe?g|webp)/.test(a.mime) && a.category !== 'logo' && !/· IA$|^Criar ·|· IA ·/.test(a.name) && a.category !== 'delivery')
        .sort((a, b) => Number(b.category === 'product_photo') - Number(a.category === 'product_photo'))
        .slice(0, 24),
    [state.assets, brandId],
  );
  const images = useMemo(
    () => state.assets.filter((a) => a.brandId === brandId && /^image\/(png|jpe?g|webp)/.test(a.mime) && a.category !== 'logo' && !/^Criar · objeto/.test(a.name)).slice(0, 36),
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
  const [subjectPrompt, setSubjectPrompt] = useState('');
  // Produto da biblioteca escolhido: a IA recorta o produto real e cria cenas com ele (fiel ao original)
  const [product, setProduct] = useState<{ id: string; url: string; name: string } | null>(null);
  const [date, setDate] = useState(today());
  const [hasDraft, setHasDraft] = useState(false);
  // Pauta do OxyPlanning escolhida: a arte volta para a mesma publicação.
  const [pauta, setPauta] = useState<Pauta | null>(null);

  const [chat, setChat] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState<'' | 'image' | 'subject' | 'save' | 'download' | 'upload'>('');
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

  // Fonte: a da marca (Google Fonts) quando o cadastro informa; senão a Saira do Oxyhub.
  const brandFont = (brand?.fonts || '').split(/[,;\n]/)[0].replace(/["']/g, '').trim().slice(0, 60);
  const [fontTick, setFontTick] = useState(0);
  useEffect(() => {
    if (!brandFont || !/^[\p{L}\p{N} ]+$/u.test(brandFont)) return;
    const id = 'brand-font-' + brandFont.replace(/\W+/g, '-');
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(brandFont)}:wght@300;400;600;700;800&display=swap`;
      document.head.appendChild(link);
    }
    void Promise.all([document.fonts.load(`800 80px "${brandFont}"`), document.fonts.load(`400 40px "${brandFont}"`)]).then(() => setFontTick((t) => t + 1));
  }, [brandFont]);
  const base = useMemo<EnvBase>(() => {
    const page = typeof document === 'undefined' ? 'Saira, sans-serif' : getComputedStyle(document.body).fontFamily || 'Saira, sans-serif';
    const family = brandFont && /^[\p{L}\p{N} ]+$/u.test(brandFont) ? `"${brandFont}", ${page}` : page;
    return { family, palette, logos, signature: brand?.name || '' };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandFont, palette, logos, brand?.name, fontTick]);

  const total = slides.length;
  const s = slides[Math.min(current, total - 1)];
  const patch = (p: Partial<Slide>) => setSlides((all) => all.map((x, i) => (i === current ? { ...x, ...p } : x)));

  // Mudou o formato ou a quantidade: ajusta o número de lâminas, mantendo o que já foi escrito.
  const resize = (n: number) =>
    setSlides((all) => {
      const next = all.slice(0, n);
      while (next.length < n) next.push({ ...blank(all[all.length - 1]?.bg || palette[0], all[all.length - 1]?.layout), image: all[all.length - 1]?.image || '', subject: all[all.length - 1]?.subject || '', dim: all[all.length - 1]?.dim ?? 30 });
      return next;
    });
  useEffect(() => {
    resize(format === 'post' ? 1 : count);
    setCurrent((c) => Math.min(c, (format === 'post' ? 1 : count) - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, count]);

  const applyPiece = (p: Piece) => {
    setSlides((all) =>
      p.slides.map((t, i) => ({
        ...(all[i] || blank(all[0]?.bg || palette[0])),
        title: t.title,
        text: t.text,
        eyebrow: t.eyebrow,
        layout: isLayout(t.layout) ? t.layout : 'manchete',
        ...(i > 0 && !all[i] ? { image: all[0]?.image || '' } : {}),
      })),
    );
    setCaption(p.caption);
    setHashtags(p.hashtags.join(' '));
    setTitle((t) => t || p.name);
    setImagePrompt(p.imagePrompt);
    setSubjectPrompt(p.subjectPrompt || '');
    void autoArt(p);
    setHasDraft(true);
    setCurrent(0);
  };
  const draftNow = (): Piece => ({
    name: title,
    idea: '',
    slides: slides.map((x) => ({ layout: x.layout, eyebrow: x.eyebrow, title: x.title, text: x.text })),
    caption,
    hashtags: hashtags.split(/\s+/).filter(Boolean),
    imagePrompt,
    subjectPrompt,
  });

  const ask = async (text: string, fmt: 'post' | 'carousel' = format, fresh = false) => {
    const msg = text.trim();
    if (!msg || thinking) return;
    if (!brand) return setError('Escolha a marca primeiro.');
    const next: Msg[] = [...(fresh ? [] : chat), { role: 'user', text: msg }];
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
          format: fmt,
          slides: fmt === 'post' ? 1 : count,
          messages: next.map((m) => ({ role: m.role, text: m.text })),
          draft: !fresh && hasDraft ? draftNow() : null,
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

  /** Gera com a IA um objeto recortado (PNG com fundo transparente) para os modelos de composição. */
  const makeSubject = async (prompt: string) => {
    const r = await fetch('/api/openai/studio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'image', kind: 'subject', brandId, prompt, productAssetId: product?.id }),
    });
    const j = (await r.json()) as { url?: string; error?: string };
    if (!r.ok || !j.url) throw new Error(j.error || 'Não foi possível gerar o objeto.');
    return j.url;
  };
  const makeScene = async (prompt: string) => {
    const r = await fetch('/api/openai/studio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'image', brandId, prompt, productAssetId: product?.id }),
    });
    const j = (await r.json()) as { url?: string; error?: string };
    if (!r.ok || !j.url) throw new Error(j.error || 'Não foi possível gerar a imagem.');
    return j.url;
  };
  /** Ao escolher um conceito, a IA já produz o objeto e/ou a foto que os modelos escolhidos pedem. */
  const autoArt = async (p: Piece) => {
    // Só gera o que falta (ajustes do rascunho não refazem imagens que já existem)
    const needSubject = (p.subjectPrompt || product) && p.slides.some((x, i) => LAYOUTS.find((l) => l.key === x.layout)?.subject && !slides[i]?.subject);
    const needPhoto = p.imagePrompt && p.slides.some((x, i) => LAYOUTS.find((l) => l.key === x.layout)?.photo === 'sim' && !slides[i]?.image);
    if (!needSubject && !needPhoto) return;
    setBusy('image');
    setError('');
    try {
      const [subject, photo] = await Promise.all([
        needSubject ? makeSubject(product ? '' : p.subjectPrompt) : Promise.resolve(''),
        needPhoto ? makeScene(p.imagePrompt) : Promise.resolve(''),
      ]);
      setSlides((all) =>
        all.map((x) => ({
          ...x,
          ...(subject && LAYOUTS.find((l) => l.key === x.layout)?.subject && !x.subject ? { subject } : {}),
          ...(photo && LAYOUTS.find((l) => l.key === x.layout)?.photo === 'sim' && !x.image ? { image: photo } : {}),
        })),
      );
      await reload().catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'A IA não conseguiu produzir as imagens.');
    } finally {
      setBusy('');
    }
  };
  const generateSubject = async () => {
    const prompt = product ? subjectPrompt.trim() : (subjectPrompt || s.title || title).trim();
    if (!prompt && !product) return setError('Descreva o objeto que a IA deve criar, ou escolha um produto.');
    setBusy('subject');
    setError('');
    try {
      patch({ subject: await makeSubject(prompt) });
      await reload().catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível gerar o objeto.');
    } finally {
      setBusy('');
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
        body: JSON.stringify({ action: 'image', brandId, prompt, productAssetId: product?.id }),
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

  const pngs = async () => {
    await Promise.all([document.fonts.load(`800 84px ${base.family}`), document.fonts.load(`400 40px ${base.family}`)]).catch(() => undefined);
    const out: Blob[] = [];
    for (let i = 0; i < slides.length; i++) out.push(await renderPng(slides[i], base, i, slides.length));
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
        headline: slides[0].title.replace(/\*/g, ''),
        copy: slides.map((x, i) => (files.length > 1 ? `${i + 1}. ` : '') + [x.title.replace(/\*/g, ''), x.text].filter(Boolean).join(' — ')).join('\n'),
        caption,
        hashtags: tagsList,
        media: ids,
        change: 'Criado no editor Criar',
      });
      // Marca ligada a um cliente do OxyPlanning: a publicação nasce lá, já para aprovação.
      const r = await fetch('/api/openai/studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'planning', contentId: id, postId: pauta?.postId }),
      });
      const j = (await r.json().catch(() => ({}))) as { planning?: string | null; error?: string };
      const when = new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
      if (!r.ok)
        setDone(`Peça salva para ${when} e já está no OxyCalendar. Não foi para o OxyPlanning: ${j.error || 'falha no envio'}. Envie pela Produção.`);
      else if (j.planning && pauta)
        setDone(`Arte enviada para a pauta “${pauta.title || 'sem título'}” de ${j.planning} no OxyPlanning, para aprovação do cliente. Está no OxyCalendar.`);
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
    setProduct(null);
    setPauta(null);
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

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(280px,340px)_minmax(0,1fr)_minmax(280px,340px)]">
        {/* Diretor de Criação */}
        <section className="glass flex min-h-[420px] flex-col rounded-[22px] p-4 xl:h-[calc(100svh-240px)]">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <Sparkles size={18} className="text-[#7c3aed]" /> Diretor de Criação
          </h2>
          <div className="mt-3">
            <PautaPicker
              brandId={brandId}
              selected={pauta}
              only="image"
              onPick={(p) => {
                setPauta(p);
                if (!p) return;
                const fmt = p.format === 'carousel' ? 'carousel' : 'post';
                setFormat(fmt);
                setTitle(p.title || p.theme || '');
                if (/^\d{4}-\d{2}-\d{2}$/.test(p.date)) setDate(p.date);
                if (p.caption) setCaption(p.caption);
                setHasDraft(false);
                void ask(pautaBriefing(p) + '\n\nCrie a peça a partir desta pauta, respeitando o texto da arte e o objetivo.', fmt, true);
              }}
            />
          </div>
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
                        <p className="mt-1.5 text-[13px] text-[#4a505c]">“{c.slides[0]?.title.replace(/\*/g, '')}”{c.slides.length > 1 ? ` + ${c.slides.length - 1} lâminas` : ''}</p>
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
            <CanvasArt s={s} base={base} index={current} total={total} width={previewW} />
          </div>
          {total > 1 ? (
            <div className="flex w-full max-w-[560px] items-center gap-2">
              <button type="button" aria-label="Lâmina anterior" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)} className="glass-btn grid size-9 shrink-0 place-items-center rounded-full disabled:opacity-40">
                <ArrowLeft size={16} />
              </button>
              <div className="flex flex-1 gap-2 overflow-x-auto py-1">
                {slides.map((x, i) => (
                  <button key={i} type="button" aria-label={`Lâmina ${i + 1}`} aria-current={i === current} onClick={() => setCurrent(i)} className={'shrink-0 rounded-[8px] ' + (i === current ? 'ring-2 ring-[#4700ff] ring-offset-2' : 'opacity-80 hover:opacity-100')}>
                    <CanvasArt s={x} base={base} index={i} total={total} width={56} />
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
          <div>
            <span className={label}>Modelo</span>
            <div className="grid grid-cols-4 gap-1.5">
              {LAYOUTS.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  title={l.hint}
                  aria-pressed={s.layout === l.key}
                  onClick={() => patch({ layout: l.key })}
                  className={
                    'h-9 rounded-full px-2 text-[12.5px] font-semibold transition-colors ' +
                    (s.layout === l.key ? 'bg-[#4700ff] text-white' : 'bg-[rgb(15_21_64/.05)] text-[#4a505c] hover:bg-[rgb(15_21_64/.09)]')
                  }
                >
                  {l.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[12px] text-[#737985]">
              {LAYOUTS.find((l) => l.key === s.layout)?.hint}.{' '}
              {LAYOUTS.find((l) => l.key === s.layout)?.photo === 'sim' && !s.image ? 'Escolha uma foto da biblioteca abaixo.' : ''}
            </p>
          </div>
          <label className="block">
            <span className={label}>Sobretítulo</span>
            <input value={s.eyebrow} onChange={(e) => patch({ eyebrow: e.target.value })} className={field} maxLength={40} placeholder="Ex.: Black Friday · Dica 01 · Novidade" />
          </label>
          <label className="block">
            <span className={label}>Título</span>
            <textarea rows={2} value={s.title} onChange={(e) => patch({ title: e.target.value })} className={field + ' resize-none'} maxLength={140} />
            <span className="mt-1 block text-[12px] text-[#737985]">Coloque *asteriscos* numa palavra para destacá-la na cor da marca.</span>
          </label>
          <label className="block">
            <span className={label}>{s.layout === 'lista' ? 'Itens (um por linha)' : s.layout === 'citacao' ? 'Assinatura' : 'Texto'}</span>
            <textarea rows={3} value={s.text} onChange={(e) => patch({ text: e.target.value })} className={field + ' resize-none'} maxLength={400} />
          </label>
          <div>
            <span className={label}>Posição do texto</span>
            <div className="flex rounded-full bg-[rgb(15_21_64/.05)] p-1">
              {(['top', 'center', 'bottom'] as Slide['align'][]).map((a) => (
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
          {LAYOUTS.find((l) => l.key === s.layout)?.subject ? (
            <div className="space-y-2">
              <span className={label}>Produto da biblioteca (opcional)</span>
              {products.length ? (
                <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Produtos da biblioteca">
                  {products.map((a) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={a.id}
                      src={a.url}
                      alt={a.name}
                      loading="lazy"
                      decoding="async"
                      title={product?.id === a.id ? 'Produto escolhido (clique para tirar)' : 'Usar este produto'}
                      onClick={() => setProduct((p) => (p?.id === a.id ? null : { id: a.id, url: a.url, name: a.name }))}
                      className={'size-12 shrink-0 cursor-pointer rounded-[8px] object-cover ' + (product?.id === a.id ? 'ring-2 ring-[#4700ff] ring-offset-1' : 'opacity-85 hover:opacity-100')}
                    />
                  ))}
                </div>
              ) : null}
              {product ? <p className="text-[12.5px] font-semibold text-[#4700ff]">Produto escolhido: {product.name.slice(0, 60)}. A IA recorta o produto real, sem inventar peças.</p> : null}
              <span className={label}>{product ? 'Observação para o recorte (opcional)' : 'Objeto 3D (recorte da IA)'}</span>
              <textarea rows={2} value={subjectPrompt} onChange={(e) => setSubjectPrompt(e.target.value)} placeholder="Ex.: um cérebro de cerâmica branca; uma folha com gota d’água; um megafone de vidro" className={field + ' resize-none'} />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="create-btn" disabled={!!busy} onClick={() => void generateSubject()}>
                  {busy === 'subject' ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />} {busy === 'subject' ? (product ? 'Recortando o produto…' : 'Criando o objeto…') : product ? 'Recortar o produto com IA' : 'Criar objeto com IA'}
                </button>
                {s.subject ? (
                  <button type="button" className="outline-btn" onClick={() => patch({ subject: '' })} aria-label="Tirar objeto">
                    <Trash2 size={16} />
                  </button>
                ) : null}
              </div>
              {subjects.length ? (
                <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Objetos já criados">
                  {subjects.map((a) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={a.id} src={a.url} alt={a.name} title={a.name} loading="lazy" decoding="async" onClick={() => patch({ subject: a.url })} className={'size-12 shrink-0 cursor-pointer rounded-[8px] bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] bg-[length:12px_12px] object-contain ' + (s.subject === a.url ? 'ring-2 ring-[#4700ff]' : '')} />
                  ))}
                </div>
              ) : null}
              <p className="text-[12px] text-[#737985]">A IA cria só o objeto, com fundo transparente; o layout, a tipografia e as cores da marca são montados aqui, com o texto sempre certo.</p>
            </div>
          ) : null}
          {LAYOUTS.find((l) => l.key === s.layout)?.photo !== 'não' ? (
          <div className="space-y-2">
            <span className={label}>{s.layout === 'recorte' ? 'Foto dentro da forma (opcional)' : 'Imagem de fundo'}</span>
            <textarea rows={2} value={imagePrompt} onChange={(e) => setImagePrompt(e.target.value)} placeholder="Descreva a imagem (sem texto): ex. mesa de café da manhã com luz natural" className={field + ' resize-none'} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className="create-btn" disabled={!!busy} onClick={() => void generateImage()}>
                {busy === 'image' ? <LoaderCircle size={16} className="animate-spin" /> : <ImagePlus size={16} />} {busy === 'image' ? 'Gerando…' : product ? 'Gerar cena com o produto' : 'Gerar com IA'}
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
                  <img key={a.id} src={a.url} alt={a.name} title={a.name} loading="lazy" decoding="async" onClick={() => patch({ image: a.url })} className={'size-12 shrink-0 cursor-pointer rounded-[8px] object-cover ' + (s.image === a.url ? 'ring-2 ring-[#4700ff]' : '')} />
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
          ) : null}
          <div className="space-y-2">
            <span className={label}>Logo</span>
            {logoAssets.length ? (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => patch({ logo: '' })} className={pill(!s.logo)}>
                  Automático
                </button>
                {logoAssets.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    title={a.name}
                    onClick={() => patch({ logo: a.url })}
                    className={'grid h-10 w-20 place-items-center rounded-[10px] bg-[repeating-conic-gradient(#d9dbe3_0_25%,#f4f5f8_0_50%)] bg-[length:10px_10px] p-1 ' + (s.logo === a.url ? 'ring-2 ring-[#4700ff]' : 'shadow-[0_0_0_1px_rgb(15_21_64/.1)]')}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt="" className="max-h-full max-w-full object-contain" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] text-[#737985]">Envie o logo (e as versões negativa e branca) em Marcas → arquivos, na categoria Logotipo.</p>
            )}
            <div className="flex rounded-full bg-[rgb(15_21_64/.05)] p-1">
              {(
                [
                  [56, 'Pequeno'],
                  [72, 'Médio'],
                  [96, 'Grande'],
                ] as const
              ).map(([v, l]) => (
                <button key={v} type="button" className={pill((s.logoSize || 72) === v) + ' flex-1 justify-center'} onClick={() => patch({ logoSize: v })}>
                  {l}
                </button>
              ))}
            </div>
            {total > 1 ? (
              <button type="button" className="text-[13px] font-semibold text-[#4700ff] hover:underline" onClick={() => setSlides((all) => all.map((x) => ({ ...x, logo: s.logo, logoSize: s.logoSize })))}>
                Usar este logo em todas as lâminas
              </button>
            ) : null}
            <p className="text-[12px] text-[#737985]">No automático, a arte usa a versão clara (negativa/branca) em fundo escuro e a escura em fundo claro.</p>
          </div>
          <div>
            <span className={label}>Cor do texto</span>
            <div className="flex rounded-full bg-[rgb(15_21_64/.05)] p-1">
              {(['auto', 'light', 'dark'] as Slide['tone'][]).map((t) => (
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
