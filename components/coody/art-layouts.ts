/**
 * Modelos de arte do Criar (OxyStudio). Um único desenho em canvas serve para a prévia ao vivo e
 * para o PNG exportado: o que aparece na tela é exatamente o que vai para o OxyPlanning.
 *
 * A ideia é parecer peça de designer, não de IA: hierarquia tipográfica clara (sobretítulo,
 * título, apoio), grade com margens generosas, cor da marca em blocos, uma palavra de destaque,
 * fotos reais da biblioteca, detalhes discretos (fios, numeração, assinatura) e um grão leve.
 */

export type Layout = 'recorte' | 'vidro' | 'gigante' | 'poster' | 'manchete' | 'editorial' | 'moldura' | 'numero' | 'citacao' | 'lista' | 'faixa' | 'foto';
export type Align = 'top' | 'center' | 'bottom';
export type TextTone = 'auto' | 'light' | 'dark';

export type ArtSlide = {
  layout: Layout;
  eyebrow: string;
  title: string;
  text: string;
  bg: string;
  image: string;
  /** Objeto recortado (PNG com fundo transparente) gerado pela IA ou da biblioteca. */
  subject: string;
  dim: number;
  align: Align;
  tone: TextTone;
};

export const LAYOUTS: { key: Layout; label: string; hint: string; photo: 'sim' | 'opcional' | 'não'; subject?: boolean }[] = [
  { key: 'recorte', label: 'Recorte', hint: 'Objeto 3D saindo de uma forma, título em cima (o objeto “escapa” da moldura)', photo: 'opcional', subject: true },
  { key: 'vidro', label: 'Vidro', hint: 'Cartão de vidro com selo, título e tópicos; o objeto passa por cima do cartão', photo: 'não', subject: true },
  { key: 'gigante', label: 'Gigante', hint: 'Número ou palavra enorme com o objeto na frente (ex.: 3 dias, 50%)', photo: 'não', subject: true },
  { key: 'poster', label: 'Pôster', hint: 'Objeto em destaque sobre fundo suave, título centralizado e um fio de ligação', photo: 'não', subject: true },
  { key: 'manchete', label: 'Manchete', hint: 'Só tipografia, título grande com uma palavra em destaque', photo: 'não' },
  { key: 'editorial', label: 'Editorial', hint: 'Foto em cima, texto num bloco de cor embaixo', photo: 'sim' },
  { key: 'moldura', label: 'Moldura', hint: 'Foto emoldurada sobre fundo claro, título embaixo', photo: 'sim' },
  { key: 'faixa', label: 'Faixa', hint: 'Foto inteira com uma faixa de cor para o texto', photo: 'sim' },
  { key: 'foto', label: 'Foto', hint: 'Foto inteira com degradê e texto por cima', photo: 'sim' },
  { key: 'numero', label: 'Número', hint: 'Um número enorme (ex.: 20%, 3x, 24h) e a explicação', photo: 'não' },
  { key: 'lista', label: 'Lista', hint: 'Título e até 4 itens numerados (um por linha no texto)', photo: 'não' },
  { key: 'citacao', label: 'Frase', hint: 'Uma frase em destaque com aspas grandes', photo: 'não' },
];
export const isLayout = (v: unknown): v is Layout => LAYOUTS.some((l) => l.key === v);

export const W = 1080;
export const H = 1350;
const M = 88; // margem

export type ArtEnv = {
  family: string;
  palette: string[];
  logo: HTMLImageElement | null;
  image: HTMLImageElement | null;
  subject: HTMLImageElement | null;
  /** Prévia na tela (mostra onde o objeto vai); no PNG exportado é false. */
  preview?: boolean;
  index: number;
  total: number;
  signature: string;
};

/* ---------------- cor ---------------- */

function rgb(hex: string) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function luma(hex: string) {
  const [r, g, b] = rgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const isLight = (hex: string) => luma(hex) > 150;
function saturation(hex: string) {
  const [r, g, b] = rgb(hex).map((x) => x / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}
function alpha(hex: string, a: number) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

/** Papéis de cor a partir da paleta da marca. */
function roles(palette: string[], bg: string) {
  const colors = palette.filter((c) => /^#[0-9a-f]{3,6}$/i.test(c));
  const dark = [...colors, '#0f1540'].sort((a, b) => luma(a) - luma(b))[0];
  const paper = '#f6f4ef';
  // Destaque: a cor mais viva da paleta que contraste com o fundo
  const ink = isLight(bg) ? '#0f1540' : '#ffffff';
  const far = (a: string, b: string) => {
    const [r1, g1, b1] = rgb(a);
    const [r2, g2, b2] = rgb(b);
    return Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2) > 120;
  };
  // Destaque: a cor mais viva da paleta que contraste com o fundo E seja diferente do texto
  const accent =
    [...colors]
      .filter((c) => Math.abs(luma(c) - luma(bg)) > 60 && saturation(c) > 0.35 && far(c, ink) && far(c, bg))
      .sort((a, b) => saturation(b) - saturation(a))[0] || null;
  // Sem cor de destaque que funcione: marca-texto (faixa atrás da palavra) numa cor da paleta
  const marker = colors.find((c) => far(c, bg)) || ink;
  return { dark, paper, hi: accent || marker, underline: !accent };
}

/* ---------------- texto ---------------- */

type Token = { word: string; hi: boolean };
/** "*palavra*" no título vira destaque. */
function tokens(text: string): Token[][] {
  return text.split('\n').map((line) => {
    const out: Token[] = [];
    let hi = false;
    for (const raw of line.split(/\s+/).filter(Boolean)) {
      let w = raw;
      const open = w.startsWith('*');
      if (open) (hi = true), (w = w.slice(1));
      const close = w.endsWith('*');
      if (close) w = w.slice(0, -1);
      if (w) out.push({ word: w, hi });
      if (close) hi = false;
    }
    return out;
  });
}
function layoutText(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const lines: Token[][] = [];
  for (const para of tokens(text)) {
    let line: Token[] = [];
    for (const t of para) {
      const test = [...line, t].map((x) => x.word).join(' ');
      if (ctx.measureText(test).width > max && line.length) {
        lines.push(line);
        line = [t];
      } else line.push(t);
    }
    lines.push(line);
  }
  return lines;
}
/** Maior tamanho (entre max e min) em que o texto cabe em `maxLines` linhas. */
function fit(ctx: CanvasRenderingContext2D, text: string, weight: number, family: string, width: number, maxLines: number, max: number, min: number) {
  for (let size = max; size >= min; size -= 4) {
    ctx.font = `${weight} ${size}px ${family}`;
    const lines = layoutText(ctx, text, width);
    if (lines.length <= maxLines) return { size, lines, font: ctx.font };
  }
  ctx.font = `${weight} ${min}px ${family}`;
  return { size: min, lines: layoutText(ctx, text, width), font: ctx.font };
}
type Fitted = { size: number; lines: Token[][]; font: string };
function drawLines(
  ctx: CanvasRenderingContext2D,
  t: Fitted,
  x: number,
  y: number,
  lh: number,
  color: string,
  hi: string,
  opts: { align?: 'left' | 'center'; width?: number; underline?: boolean } = {},
) {
  const { lines, size } = t;
  ctx.font = t.font; // a fonte medida no fit (outra medição pode ter trocado ctx.font)
  ctx.textBaseline = 'alphabetic';
  for (const line of lines) {
    const full = line.map((t) => t.word).join(' ');
    let cx = opts.align === 'center' && opts.width ? x + (opts.width - ctx.measureText(full).width) / 2 : x;
    const base = y + size * 0.82;
    line.forEach((t, i) => {
      const word = (i ? ' ' : '') + t.word;
      const w = ctx.measureText(word).width;
      if (t.hi && opts.underline) {
        const sp = i ? ctx.measureText(' ').width : 0;
        ctx.fillStyle = alpha(hi, 0.28);
        ctx.fillRect(cx + sp - size * 0.04, base - size * 0.28, w - sp + size * 0.08, size * 0.3);
      }
      ctx.fillStyle = t.hi && !opts.underline ? hi : color;
      ctx.fillText(word, cx, base);
      cx += w;
    });
    y += size * lh;
  }
  return y;
}
function plain(text: string) {
  return text.replace(/\*/g, '');
}

/* ---------------- peças comuns ---------------- */

function eyebrow(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, family: string, rule = true) {
  if (!text) return y;
  ctx.font = `700 26px ${family}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  let cx = x;
  if (rule) {
    ctx.fillRect(x, y + 12, 44, 3);
    cx += 64;
  }
  const label = plain(text).toUpperCase();
  // espaçamento entre letras
  for (const ch of label) {
    ctx.fillText(ch, cx, y + 24);
    cx += ctx.measureText(ch).width + 3.2;
  }
  return y + 64;
}
function footer(ctx: CanvasRenderingContext2D, env: ArtEnv, color: string, y = H - M, line = true) {
  if (line) {
    ctx.fillStyle = alpha(color, 0.22);
    ctx.fillRect(M, y - 54, W - M * 2, 2);
  }
  if (env.logo && env.logo.width && env.logo.height) {
    const r = Math.min(240 / env.logo.width, 44 / env.logo.height);
    const w = env.logo.width * r;
    const h = env.logo.height * r;
    ctx.drawImage(env.logo, M, y - h + 4, w, h);
  } else if (env.signature) {
    ctx.font = `700 26px ${env.family}`;
    ctx.fillStyle = color;
    ctx.fillText(env.signature, M, y);
  }
  ctx.font = `600 24px ${env.family}`;
  ctx.fillStyle = alpha(color, 0.75);
  ctx.textAlign = 'right';
  const n = env.total > 1 ? `${String(env.index + 1).padStart(2, '0')} / ${String(env.total).padStart(2, '0')}` : '';
  ctx.fillText(env.total > 1 && env.index === 0 ? `${n}   arraste →` : n, W - M, y);
  ctx.textAlign = 'left';
}
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, focusY = 0.45) {
  const r = Math.max(w / img.width, h / img.height);
  const iw = img.width * r;
  const ih = img.height * r;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, x + (w - iw) / 2, y + (h - ih) * focusY, iw, ih);
  ctx.restore();
}
function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
/** Foto ausente: um campo de cor com formas discretas (nunca imagem genérica de IA). */
function photoPlaceholder(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, base: string, accent: string) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = alpha(accent, 0.22);
  ctx.beginPath();
  ctx.arc(x + w * 0.78, y + h * 0.3, Math.min(w, h) * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = alpha(isLight(base) ? '#0f1540' : '#ffffff', 0.18);
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(x + w * 0.15, y + h * 0.95, 80 + i * 60, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
let grainTile: HTMLCanvasElement | null = null;
/** Grão leve de impressão: tira o aspecto "plano demais" de arte digital. */
function grain(ctx: CanvasRenderingContext2D) {
  if (!grainTile) {
    grainTile = document.createElement('canvas');
    grainTile.width = grainTile.height = 160;
    const g = grainTile.getContext('2d')!;
    const data = g.createImageData(160, 160);
    let seed = 7;
    for (let i = 0; i < data.data.length; i += 4) {
      seed = (seed * 16807) % 2147483647;
      const v = seed % 255;
      data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
      data.data[i + 3] = 14;
    }
    g.putImageData(data, 0, 0);
  }
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = ctx.createPattern(grainTile, 'repeat')!;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}


/* ---------------- composição com objeto recortado ---------------- */

function shade(hex: string, amount: number) {
  const [r, g, b] = rgb(hex);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
/** Desenha o objeto inteiro dentro da caixa (centro cx, cy), com sombra suave que segue o recorte. */
function drawSubject(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cx: number, cy: number, maxW: number, maxH: number, shadow = 0.35) {
  const r = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * r;
  const h = img.height * r;
  ctx.save();
  if (shadow) {
    ctx.shadowColor = `rgba(8,10,30,${shadow})`;
    ctx.shadowBlur = 70;
    ctx.shadowOffsetY = 36;
  }
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}
/** Sem objeto ainda: um contorno pontilhado que mostra onde ele vai (só na prévia). */
function subjectSlot(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string, family: string) {
  ctx.save();
  ctx.setLineDash([14, 12]);
  ctx.strokeStyle = alpha(color, 0.45);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `600 28px ${family}`;
  ctx.fillStyle = alpha(color, 0.7);
  ctx.textAlign = 'center';
  ctx.fillText('objeto da IA', cx, cy + 10);
  ctx.textAlign = 'left';
  ctx.restore();
}
function bookmark(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, notch: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + w / 2, y + h - notch);
  ctx.lineTo(x, y + h);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function centered(ctx: CanvasRenderingContext2D, t: Fitted, y: number, lh: number, color: string, hi: string, underline: boolean) {
  return drawLines(ctx, t, M, y, lh, color, hi, { align: 'center', width: W - M * 2, underline });
}

/* ---------------- modelos ---------------- */

export function drawSlide(ctx: CanvasRenderingContext2D, s: ArtSlide, env: ArtEnv) {
  const f = env.family;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  const base = roles(env.palette, s.bg);
  const { dark, paper } = base;
  const accent = base.hi;
  const ul = { underline: base.underline };
  const toneFor = (bg: string) => (s.tone === 'light' ? '#ffffff' : s.tone === 'dark' ? '#0f1540' : isLight(bg) ? '#0f1540' : '#ffffff');
  const img = env.image;
  const layout = s.layout;

  if (layout === 'recorte') {
    // Fundo claro, título no alto, forma (marcador) na cor da marca e o objeto escapando dela
    const bg = isLight(s.bg) ? s.bg : paper;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const r2 = roles(env.palette, bg);
    const ink = toneFor(bg);
    let y = 96;
    if (s.eyebrow) {
      ctx.font = `700 26px ${f}`;
      ctx.fillStyle = r2.hi;
      ctx.textAlign = 'center';
      ctx.fillText(plain(s.eyebrow).toUpperCase(), W / 2, y + 24);
      ctx.textAlign = 'left';
      y += 60;
    }
    const t = fit(ctx, s.title, 800, f, W - M * 2, 2, 92, 60);
    y = centered(ctx, t, y, 1.02, ink, r2.hi, r2.underline);
    if (s.text) {
      const b = fit(ctx, s.text, 400, f, W - M * 2 - 120, 2, 32, 26);
      y = centered(ctx, b, y + 10, 1.36, alpha(ink, 0.75), r2.hi, false);
    }
    const sx = 250;
    const sy = Math.max(y + 70, 470);
    const sw = W - sx * 2;
    const sh = H - sy - 150;
    const fill = [env.palette[0], ...env.palette].find((c) => !isLight(c) || saturation(c) > 0.4) || dark;
    ctx.save();
    ctx.shadowColor = 'rgba(8,10,30,.18)';
    ctx.shadowBlur = 50;
    ctx.shadowOffsetY = 24;
    bookmark(ctx, sx, sy, sw, sh, 34, 110);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
    if (img) {
      ctx.save();
      bookmark(ctx, sx, sy, sw, sh, 34, 110);
      ctx.clip();
      cover(ctx, img, sx, sy, sw, sh);
      ctx.restore();
    }
    if (env.subject) drawSubject(ctx, env.subject, W / 2, sy + sh * 0.46, sw * 1.45, sh * 1.05, 0.3);
    else if (env.preview) subjectSlot(ctx, W / 2, sy + sh * 0.45, sw * 0.8, '#ffffff', f);
    footer(ctx, env, ink, H - 56, false);
  } else if (layout === 'vidro') {
    // Fundo em degradê da cor da marca, cartão de vidro e o objeto passando por cima
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, shade(s.bg, 0.12));
    g.addColorStop(1, shade(s.bg, -0.45));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const ink = s.tone === 'dark' ? '#0f1540' : s.tone === 'light' ? '#ffffff' : isLight(s.bg) && luma(s.bg) > 200 ? '#0f1540' : '#ffffff';
    const cx = M - 8;
    const cy = 200;
    const cw = W * 0.74;
    const ch = H - 380;
    ctx.save();
    rounded(ctx, cx, cy, cw, ch, 40);
    const cg = ctx.createLinearGradient(cx, cy, cx, cy + ch);
    cg.addColorStop(0, ink === '#ffffff' ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.55)');
    cg.addColorStop(1, ink === '#ffffff' ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.30)');
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = ink === '#ffffff' ? 'rgba(255,255,255,.28)' : 'rgba(15,21,64,.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    let y = cy + 64;
    const r2 = roles(env.palette, s.bg);
    if (s.eyebrow) {
      ctx.font = `800 26px ${f}`;
      const label = plain(s.eyebrow).toUpperCase();
      const w = ctx.measureText(label).width + 44;
      rounded(ctx, cx + 64, y, w, 52, 14);
      ctx.fillStyle = r2.hi;
      ctx.fill();
      ctx.fillStyle = isLight(r2.hi) ? '#0f1540' : '#ffffff';
      ctx.fillText(label, cx + 86, y + 35);
      y += 92;
    }
    const inner = cw - 128;
    const t = fit(ctx, s.title, 700, f, inner * 0.78, 3, 108, 64);
    y = drawLines(ctx, t, cx + 64, y, 1.02, ink, r2.hi, { underline: r2.underline });
    ctx.fillStyle = alpha(ink, 0.2);
    ctx.fillRect(cx + 64, y + 30, inner, 2);
    y += 70;
    const items = s.text.split(/\n|;|•/).map((x) => x.trim()).filter(Boolean).slice(0, 4);
    if (items.length > 1) {
      for (const it of items) {
        const b = fit(ctx, it, 500, f, inner * 0.62 - 40, 2, 36, 28);
        ctx.fillStyle = r2.hi;
        ctx.beginPath();
        ctx.arc(cx + 74, y + b.size * 0.55, 7, 0, Math.PI * 2);
        ctx.fill();
        y = drawLines(ctx, b, cx + 104, y, 1.28, alpha(ink, 0.92), r2.hi) + 18;
      }
    } else if (s.text) {
      const b = fit(ctx, s.text, 400, f, inner * 0.62, 4, 36, 28);
      drawLines(ctx, b, cx + 64, y, 1.4, alpha(ink, 0.88), r2.hi);
    }
    if (env.subject) drawSubject(ctx, env.subject, W * 0.73, H * 0.5, W * 0.62, H * 0.7, 0.4);
    else if (env.preview) subjectSlot(ctx, W * 0.74, H * 0.5, 380, ink, f);
    footer(ctx, env, ink, H - 70, false);
  } else if (layout === 'gigante') {
    // Número/palavra enorme e o objeto na frente dele
    const v = ctx.createRadialGradient(W / 2, H * 0.45, 100, W / 2, H * 0.5, W);
    v.addColorStop(0, shade(s.bg, 0.08));
    v.addColorStop(1, shade(s.bg, -0.4));
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    const ink = toneFor(s.bg);
    const r2 = roles(env.palette, s.bg);
    const m = /^\s*\*?([^\s*]+)\*?\s*(.*)$/s.exec(plain(s.title)) || ['', s.title, ''];
    const big = m[1];
    const rest = m[2];
    let y = 96;
    if (rest) {
      const t = fit(ctx, rest, 600, f, W - M * 2, 2, 60, 40);
      y = centered(ctx, t, y, 1.1, ink, r2.hi, r2.underline);
    }
    if (s.eyebrow) {
      ctx.font = `500 26px ${f}`;
      ctx.fillStyle = alpha(ink, 0.7);
      ctx.textAlign = 'center';
      ctx.fillText(plain(s.eyebrow).toUpperCase().split('').join(' '), W / 2, y + 30);
      ctx.textAlign = 'left';
      y += 50;
    }
    const n = fit(ctx, big, 900, f, W - M * 2, 1, 760, 200);
    ctx.font = n.font;
    const nw = ctx.measureText(big).width;
    const baseY = Math.min(H - 170, y + 60 + n.size * 0.78);
    ctx.fillStyle = isLight(s.bg) ? shade(s.bg, -0.18) : alpha('#ffffff', 0.9);
    ctx.fillText(big, (W - nw) / 2, baseY);
    if (env.subject) drawSubject(ctx, env.subject, W / 2, baseY - n.size * 0.32, W * 0.82, n.size * 0.95, 0.45);
    else if (env.preview) subjectSlot(ctx, W / 2, baseY - n.size * 0.35, 360, ink, f);
    if (s.text) {
      const b = fit(ctx, s.text, 500, f, 380, 5, 30, 24);
      drawLines(ctx, b, W - M - 380, baseY - n.size * 0.42, 1.6, alpha(ink, 0.92), r2.hi);
    }
    footer(ctx, env, ink, H - 60, false);
  } else if (layout === 'poster') {
    // Fundo suave em luz difusa, objeto no alto, fio de ligação e título centralizado
    ctx.fillStyle = shade(s.bg, isLight(s.bg) ? 0 : 0.55);
    ctx.fillRect(0, 0, W, H);
    const blobs = [env.palette[0], env.palette[2] || env.palette[1] || '#2563eb', env.palette[1] || '#7c3aed'];
    [
      [W * 0.1, H * 0.45, 420],
      [W * 0.95, H * 0.5, 460],
      [W * 0.5, H * 0.05, 380],
    ].forEach(([x, y, r], i) => {
      const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, alpha(blobs[i] && blobs[i].startsWith('#') ? blobs[i] : '#2563eb', 0.35));
      gr.addColorStop(1, alpha(blobs[i] && blobs[i].startsWith('#') ? blobs[i] : '#2563eb', 0));
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    });
    const ink = s.tone === 'dark' ? '#0f1540' : s.tone === 'light' ? '#ffffff' : '#0f1540';
    const r2 = roles(env.palette, '#eef0f6');
    let box = { x: W / 2 - 200, y: 160, w: 400, h: 420 };
    if (env.subject) box = drawSubject(ctx, env.subject, W / 2, 380, W * 0.62, 520, 0.22);
    else if (env.preview) subjectSlot(ctx, W / 2, 380, 380, ink, f);
    const lineTop = box.y + box.h + 20;
    const t = fit(ctx, s.title, 500, f, W - M * 2, 3, 104, 64);
    const b = s.text ? fit(ctx, s.text, 400, f, W - M * 2 - 120, 3, 38, 30) : null;
    const blockH = t.lines.length * t.size * 1.06 + (b ? 36 + b.lines.length * b.size * 1.35 : 0);
    const ty = Math.max(lineTop + 90, H - 150 - blockH);
    ctx.fillStyle = alpha(ink, 0.55);
    ctx.fillRect(W / 2 - 1, lineTop, 2, ty - lineTop - 30);
    ctx.beginPath();
    ctx.arc(W / 2, lineTop, 9, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
    let y = centered(ctx, t, ty, 1.06, ink, r2.hi, r2.underline);
    if (b) y = centered(ctx, b, y + 36, 1.35, alpha(ink, 0.8), r2.hi, false);
    if (s.eyebrow) {
      ctx.font = `700 24px ${f}`;
      ctx.fillStyle = alpha(ink, 0.65);
      ctx.fillText(plain(s.eyebrow).toUpperCase(), M, 92);
    }
    footer(ctx, env, ink, H - 56, false);
  } else if (layout === 'editorial') {
    const split = Math.round(H * 0.56);
    if (img) cover(ctx, img, 0, 0, W, split);
    else photoPlaceholder(ctx, 0, 0, W, split, dark, accent);
    if (img && s.dim) {
      ctx.fillStyle = `rgba(0,0,0,${s.dim / 200})`;
      ctx.fillRect(0, 0, W, split);
    }
    ctx.fillStyle = s.bg;
    ctx.fillRect(0, split, W, H - split);
    const ink = toneFor(s.bg);
    const r2 = roles(env.palette, s.bg);
    const hi = r2.hi;
    const ul2 = { underline: r2.underline };
    let y = eyebrow(ctx, s.eyebrow, M, split + 64, hi, f);
    if (!s.eyebrow) y = split + 72;
    const t = fit(ctx, s.title, 800, f, W - M * 2, 3, 84, 52);
    y = drawLines(ctx, t, M, y, 1.04, ink, hi, ul2);
    if (s.text) {
      const b = fit(ctx, s.text, 400, f, W - M * 2, 3, 34, 28);
      drawLines(ctx, b, M, y + 18, 1.38, alpha(ink, 0.82), hi);
    }
    footer(ctx, env, ink, H - 64, false);
  } else if (layout === 'moldura') {
    const bg = isLight(s.bg) ? s.bg : paper;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const ink = toneFor(bg);
    const r2 = roles(env.palette, bg);
    const hi = r2.hi;
    const ul2 = { underline: r2.underline };
    let y = eyebrow(ctx, s.eyebrow, M, 92, hi, f);
    if (!s.eyebrow) y = 100;
    const fh = 640;
    ctx.save();
    rounded(ctx, M, y, W - M * 2, fh, 30);
    ctx.clip();
    if (img) cover(ctx, img, M, y, W - M * 2, fh);
    else photoPlaceholder(ctx, M, y, W - M * 2, fh, dark, accent);
    ctx.restore();
    y += fh + 56;
    const t = fit(ctx, s.title, 800, f, W - M * 2, 2, 76, 50);
    y = drawLines(ctx, t, M, y, 1.04, ink, hi, ul2);
    if (s.text) {
      const b = fit(ctx, s.text, 400, f, W - M * 2, 2, 32, 26);
      drawLines(ctx, b, M, y + 14, 1.36, alpha(ink, 0.78), hi);
    }
    footer(ctx, env, ink, H - 60, false);
  } else if (layout === 'faixa' || layout === 'foto') {
    if (img) cover(ctx, img, 0, 0, W, H);
    else photoPlaceholder(ctx, 0, 0, W, H, dark, accent);
    if (layout === 'foto') {
      // Degradê só onde está o texto (a foto respira no resto)
      const top = s.align === 'top';
      const g = ctx.createLinearGradient(0, top ? 0 : H, 0, top ? H * 0.7 : H * 0.3);
      g.addColorStop(0, `rgba(10,12,30,${0.55 + s.dim / 200})`);
      g.addColorStop(1, 'rgba(10,12,30,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      const ink = s.tone === 'dark' ? '#0f1540' : '#ffffff';
      const t = fit(ctx, s.title, 800, f, W - M * 2, 4, 96, 56);
      const b = s.text ? fit(ctx, s.text, 400, f, W - M * 2, 3, 36, 28) : null;
      const blockH = 64 * (s.eyebrow ? 1 : 0) + t.lines.length * t.size * 1.04 + (b ? 22 + b.lines.length * b.size * 1.38 : 0);
      let y = top ? 140 : s.align === 'center' ? (H - blockH) / 2 : H - 150 - blockH;
      y = eyebrow(ctx, s.eyebrow, M, y, '#ffffff', f);
      y = drawLines(ctx, t, M, y, 1.04, ink, base.underline ? '#ffffff' : accent, { underline: true });
      if (b) drawLines(ctx, b, M, y + 22, 1.38, alpha(ink, 0.88), accent);
      footer(ctx, env, ink, top ? H - 64 : 96, false);
    } else {
      if (s.dim) {
        ctx.fillStyle = `rgba(0,0,0,${s.dim / 250})`;
        ctx.fillRect(0, 0, W, H);
      }
      const bandH = 470;
      const by = s.align === 'top' ? 150 : H - bandH - 120;
      ctx.fillStyle = s.bg;
      ctx.fillRect(0, by, W - 120, bandH);
      const ink = toneFor(s.bg);
      const r2 = roles(env.palette, s.bg);
    const hi = r2.hi;
    const ul2 = { underline: r2.underline };
      let y = eyebrow(ctx, s.eyebrow, M, by + 58, hi, f);
      if (!s.eyebrow) y = by + 70;
      const t = fit(ctx, s.title, 800, f, W - 120 - M * 2, 3, 80, 52);
      y = drawLines(ctx, t, M, y, 1.04, ink, hi, ul2);
      if (s.text) {
        const b = fit(ctx, s.text, 400, f, W - 120 - M * 2, 2, 32, 26);
        drawLines(ctx, b, M, y + 14, 1.36, alpha(ink, 0.82), hi);
      }
      footer(ctx, env, '#ffffff', s.align === 'top' ? H - 60 : 96, false);
    }
  } else {
    // Modelos tipográficos sobre a cor da marca
    ctx.fillStyle = s.bg;
    ctx.fillRect(0, 0, W, H);
    const ink = toneFor(s.bg);
    const hi = accent;
    // Detalhe geométrico discreto no canto
    ctx.strokeStyle = alpha(ink, 0.1);
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(W + 40, -40, 260 + i * 90, 0, Math.PI * 2);
      ctx.stroke();
    }
    let y = eyebrow(ctx, s.eyebrow, M, M + 8, hi, f);
    if (!s.eyebrow) y = M + 24;

    if (layout === 'numero') {
      const m = /^\s*\*?([^\s*]+)\*?\s*(.*)$/s.exec(plain(s.title)) || ['', s.title, ''];
      const big = m[1];
      const rest = m[2];
      const n = fit(ctx, big, 800, f, W - M * 2, 1, 340, 140);
      ctx.font = `800 ${n.size}px ${f}`;
      ctx.fillStyle = hi;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(big, M - n.size * 0.04, y + n.size * 0.86);
      y += n.size * 0.98 + 24;
      if (rest) {
        const t = fit(ctx, rest, 700, f, W - M * 2, 3, 64, 44);
        y = drawLines(ctx, t, M, y, 1.08, ink, hi, ul);
      }
      if (s.text) {
        const b = fit(ctx, s.text, 400, f, W - M * 2, 4, 34, 28);
        drawLines(ctx, b, M, y + 24, 1.4, alpha(ink, 0.8), hi);
      }
    } else if (layout === 'citacao') {
      ctx.font = `800 300px Georgia, serif`;
      ctx.fillStyle = hi;
      ctx.fillText('“', M - 14, y + 230);
      y += 230;
      const t = fit(ctx, s.title, 300, f, W - M * 2, 6, 72, 46);
      y = drawLines(ctx, t, M, y, 1.18, ink, hi, ul);
      if (s.text) {
        ctx.fillStyle = hi;
        ctx.fillRect(M, y + 34, 44, 3);
        const b = fit(ctx, s.text, 600, f, W - M * 2 - 64, 2, 30, 24);
        drawLines(ctx, b, M + 64, y + 22, 1.3, alpha(ink, 0.85), hi);
      }
    } else if (layout === 'lista') {
      const t = fit(ctx, s.title, 800, f, W - M * 2, 3, 80, 52);
      y = drawLines(ctx, t, M, y, 1.04, ink, hi, ul) + 40;
      const items = s.text
        .split(/\n|;|•/)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 4);
      const rowH = Math.min(170, (H - 170 - y) / Math.max(1, items.length));
      items.forEach((it, i) => {
        ctx.fillStyle = alpha(ink, 0.18);
        ctx.fillRect(M, y, W - M * 2, 2);
        ctx.font = `800 40px ${f}`;
        ctx.fillStyle = hi;
        ctx.fillText(String(i + 1).padStart(2, '0'), M, y + 62);
        const b = fit(ctx, it, 600, f, W - M * 2 - 110, 2, 38, 28);
        drawLines(ctx, b, M + 110, y + 30, 1.25, ink, hi);
        y += rowH;
      });
    } else {
      // manchete
      const t = fit(ctx, s.title, 800, f, W - M * 2, 5, 132, 72);
      const b = s.text ? fit(ctx, s.text, 400, f, W - M * 2 - 40, 3, 36, 28) : null;
      const blockH = t.lines.length * t.size * 1.0 + (b ? 40 + b.lines.length * b.size * 1.4 : 0);
      const top = s.align === 'top' ? y + 20 : s.align === 'center' ? (H - blockH) / 2 : H - 190 - blockH;
      let yy = drawLines(ctx, t, M - 4, Math.max(y, top), 1.0, ink, hi, ul);
      if (b) {
        ctx.fillStyle = hi;
        ctx.fillRect(M, yy + 28, 6, b.lines.length * b.size * 1.4 - 8);
        yy = drawLines(ctx, b, M + 34, yy + 24, 1.4, alpha(ink, 0.85), hi);
      }
    }
    footer(ctx, env, ink);
  }
  grain(ctx);
  ctx.restore();
}

/** Lâmina em branco no modelo indicado. */
export const blankSlide = (bg: string, layout: Layout = 'manchete'): ArtSlide => ({ layout, eyebrow: '', title: '', text: '', bg, image: '', subject: '', dim: 30, align: 'bottom', tone: 'auto' });
