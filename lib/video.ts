import { env } from 'cloudflare:workers';
import { createHash, timingSafeEqual } from 'node:crypto';
import { database } from './repository';

/**
 * Video & Motion (OxyStudio + OxyVideo).
 *
 * O OxyStudio guarda a fila de produções; quem produz é o worker do OxyVideo, que roda no Mac da
 * agência e BUSCA trabalho aqui (nenhuma conexão chega até o Mac). O worker se identifica com
 * OXYVIDEO_WORKER_TOKEN (mesmo valor no worker e na Vercel).
 *
 * A IA só escreve o plano de edição (JSON validado). Quem corta, anima e renderiza é o Remotion
 * no worker. Nada é simulado: status, progresso e motores vêm do worker.
 */

export const PRODUCTION_TYPES = [
  'Edição de vídeo',
  'Motion Graphics 2D',
  'Motion Graphics 3D',
  'Animação de logotipo',
  'Apresentação de produto',
  'Vídeo institucional',
  'Vídeo publicitário',
  'Reels e Stories',
  'Edição de entrevistas',
  'Produção personalizada',
] as const;

export const FORMATS = {
  vertical: { label: 'Vertical', width: 1080, height: 1920 },
  horizontal: { label: 'Horizontal', width: 1920, height: 1080 },
  feed: { label: 'Feed', width: 1080, height: 1350 },
  quadrado: { label: 'Quadrado', width: 1080, height: 1080 },
  '4k': { label: '4K', width: 3840, height: 2160 },
} as const;
export type FormatKey = keyof typeof FORMATS | 'custom';

export const STYLES = ['Liquid Glass', 'Minimalista', 'Energético', 'Corporativo', 'Cinematográfico', 'Divertido'] as const;
export const QUALITIES = { previa: 'Prévia rápida', alta: 'Alta', maxima: 'Máxima' } as const;
export const LANGUAGES = { 'pt-BR': 'Português', en: 'Inglês', es: 'Espanhol' } as const;

export type JobStatus = 'queued' | 'running' | 'review' | 'approved' | 'failed' | 'cancelled';

/** Pedido feito na tela (tudo validado em cleanRequest). */
export type VideoRequest = {
  type: (typeof PRODUCTION_TYPES)[number];
  formats: { key: FormatKey; width: number; height: number }[];
  durationSeconds: number;
  language: keyof typeof LANGUAGES;
  captions: boolean;
  music: 'none' | 'source';
  musicAssetId: string | null;
  narration: boolean;
  style: (typeof STYLES)[number];
  quality: keyof typeof QUALITIES;
  briefing: string;
  /** Arquivos da biblioteca (inclui os enviados agora e os de produções anteriores). */
  assetIds: string[];
  /** Pastas liberadas no worker (id da pasta + arquivos escolhidos, caminhos relativos). */
  folders: { id: string; files: string[] }[];
  /** Pedido de alteração (revisão): o que mudar em relação à versão anterior. */
  revision: string;
};

export type Scene = {
  kind: 'clip' | 'image' | 'title' | 'logo' | 'end';
  sourceId: string | null;
  start: number;
  duration: number;
  headline: string;
  text: string;
  layout: 'center' | 'top' | 'bottom';
  transition: 'cut' | 'fade' | 'slide' | 'zoom';
  motion: 'none' | 'kenburns' | 'pop' | 'slide-up' | 'glass';
  background: 'brand' | 'dark' | 'light' | 'source';
  muted: boolean;
};
export type EditPlan = {
  title: string;
  summary: string;
  direction: string;
  scenes: Scene[];
  captions: 'dinamica' | 'simples' | 'nenhuma';
  musicSourceId: string | null;
  musicVolume: number;
  notes: string;
};

/** Fonte analisada pelo worker (o que a IA recebe sobre cada arquivo). */
export type SourceInfo = {
  id: string;
  name: string;
  kind: 'video' | 'image' | 'audio' | 'other';
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
  transcript: string;
};

const cfg = () => env as unknown as Record<string, string | undefined>;

let ready: Promise<void> | null = null;
export function ensureVideoTables() {
  ready ??= (async () => {
    const db = database();
    await db.batch([
      db.prepare(
        "CREATE TABLE IF NOT EXISTS video_jobs (id TEXT PRIMARY KEY NOT NULL, workspaceId TEXT NOT NULL, brandId TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, stage TEXT NOT NULL DEFAULT '', progress INTEGER NOT NULL DEFAULT 0, request TEXT NOT NULL, analysis TEXT, plan TEXT, version INTEGER NOT NULL DEFAULT 1, rootId TEXT NOT NULL, parentId TEXT, outputs TEXT NOT NULL DEFAULT '[]', error TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 0, lockedBy TEXT, lockedAt TEXT, createdBy TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, finishedAt TEXT, sourceRef TEXT)",
      ),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_video_jobs_ws ON video_jobs (workspaceId, createdAt)'),
      db.prepare('CREATE INDEX IF NOT EXISTS idx_video_jobs_status ON video_jobs (status, createdAt)'),
      db.prepare(
        "CREATE TABLE IF NOT EXISTS video_workers (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, lastSeen TEXT NOT NULL, info TEXT NOT NULL DEFAULT '{}')",
      ),
    ]);
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/** Confere o token do worker (Authorization: Bearer …). */
export function workerAuthorized(token: string | null | undefined) {
  const expected = cfg().OXYVIDEO_WORKER_TOKEN ?? '';
  if (expected.length < 32 || !token) return false;
  const a = createHash('sha256').update(token).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
export const workerConfigured = () => (cfg().OXYVIDEO_WORKER_TOKEN ?? '').length >= 32;

const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const num = (v: unknown, min: number, max: number, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const id = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(v) ? v : '');

export function cleanRequest(raw: Record<string, unknown>): VideoRequest {
  const type = PRODUCTION_TYPES.find((t) => t === raw.type) ?? 'Edição de vídeo';
  const formats: VideoRequest['formats'] = [];
  for (const f of Array.isArray(raw.formats) ? raw.formats : []) {
    const o = (f ?? {}) as Record<string, unknown>;
    const key = (typeof o.key === 'string' ? o.key : '') as FormatKey;
    if (key === 'custom') {
      // Par de dimensões (vídeo H.264 exige números pares).
      const w = Math.round(num(o.width, 240, 3840, 1080) / 2) * 2;
      const h = Math.round(num(o.height, 240, 3840, 1920) / 2) * 2;
      formats.push({ key, width: w, height: h });
    } else if (key in FORMATS) {
      const d = FORMATS[key as keyof typeof FORMATS];
      formats.push({ key, width: d.width, height: d.height });
    }
  }
  if (!formats.length) throw new Error('Escolha pelo menos um formato.');
  const folders: VideoRequest['folders'] = [];
  for (const f of Array.isArray(raw.folders) ? raw.folders.slice(0, 5) : []) {
    const o = (f ?? {}) as Record<string, unknown>;
    const fid = id(o.id);
    const files = (Array.isArray(o.files) ? o.files : [])
      .map((p) => str(p, 500))
      .filter((p) => p && !p.startsWith('/') && !p.split('/').includes('..'))
      .slice(0, 80);
    if (fid && files.length) folders.push({ id: fid, files });
  }
  const assetIds = [...new Set((Array.isArray(raw.assetIds) ? raw.assetIds : []).map(id).filter(Boolean))].slice(0, 80);
  const briefing = str(raw.briefing, 6000);
  if (!briefing) throw new Error('Conte o que você deseja criar.');
  if (!assetIds.length && !folders.length && !['Motion Graphics 2D', 'Motion Graphics 3D', 'Animação de logotipo'].includes(type))
    throw new Error('Escolha os arquivos da produção (envio, biblioteca ou pasta do computador).');
  return {
    type,
    formats: formats.slice(0, 6),
    durationSeconds: Math.round(num(raw.durationSeconds, 5, 600, 30)),
    language: (Object.keys(LANGUAGES).find((l) => l === raw.language) as VideoRequest['language']) ?? 'pt-BR',
    captions: raw.captions === true,
    music: raw.music === 'source' ? 'source' : 'none',
    musicAssetId: id(raw.musicAssetId) || null,
    narration: false,
    style: STYLES.find((s) => s === raw.style) ?? 'Liquid Glass',
    quality: (Object.keys(QUALITIES).find((q) => q === raw.quality) as VideoRequest['quality']) ?? 'alta',
    briefing,
    assetIds,
    folders,
    revision: '',
  };
}

/** JSON Schema estrito do plano (OpenAI Responses, text.format json_schema). */
export const planSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'summary', 'direction', 'scenes', 'captions', 'musicSourceId', 'musicVolume', 'notes'],
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    direction: { type: 'string' },
    captions: { type: 'string', enum: ['dinamica', 'simples', 'nenhuma'] },
    musicSourceId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    musicVolume: { type: 'number' },
    notes: { type: 'string' },
    scenes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'sourceId', 'start', 'duration', 'headline', 'text', 'layout', 'transition', 'motion', 'background', 'muted'],
        properties: {
          kind: { type: 'string', enum: ['clip', 'image', 'title', 'logo', 'end'] },
          sourceId: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          start: { type: 'number' },
          duration: { type: 'number' },
          headline: { type: 'string' },
          text: { type: 'string' },
          layout: { type: 'string', enum: ['center', 'top', 'bottom'] },
          transition: { type: 'string', enum: ['cut', 'fade', 'slide', 'zoom'] },
          motion: { type: 'string', enum: ['none', 'kenburns', 'pop', 'slide-up', 'glass'] },
          background: { type: 'string', enum: ['brand', 'dark', 'light', 'source'] },
          muted: { type: 'boolean' },
        },
      },
    },
  },
} as const;

/**
 * Valida o plano contra os arquivos reais: cena que cita arquivo inexistente, trecho fora da duração
 * do vídeo ou tipo errado é corrigida ou descartada. Plano sem cenas válidas é erro (nunca parcial).
 */
export function cleanPlan(raw: unknown, sources: SourceInfo[], maxSeconds: number): EditPlan {
  const p = (raw ?? {}) as Record<string, unknown>;
  const byId = new Map(sources.map((s) => [s.id, s]));
  const scenes: Scene[] = [];
  let total = 0;
  for (const r of Array.isArray(p.scenes) ? p.scenes.slice(0, 60) : []) {
    const s = (r ?? {}) as Record<string, unknown>;
    const kind = (['clip', 'image', 'title', 'logo', 'end'] as const).find((k) => k === s.kind);
    if (!kind) continue;
    const src = typeof s.sourceId === 'string' ? byId.get(s.sourceId) : undefined;
    let start = num(s.start, 0, 36000, 0);
    let duration = num(s.duration, 0.4, 120, 3);
    if (kind === 'clip') {
      if (!src || src.kind !== 'video' || !(src.duration > 0)) continue;
      if (start >= src.duration - 0.2) start = 0;
      duration = Math.min(duration, src.duration - start);
      if (duration < 0.4) continue;
    }
    if (kind === 'image' && (!src || src.kind !== 'image')) continue;
    if (total + duration > maxSeconds + 0.5) duration = maxSeconds - total;
    if (duration < 0.4) break;
    total += duration;
    scenes.push({
      kind,
      sourceId: kind === 'clip' || kind === 'image' ? src!.id : null,
      start: kind === 'clip' ? Math.round(start * 100) / 100 : 0,
      duration: Math.round(duration * 100) / 100,
      headline: str(s.headline, 90),
      text: str(s.text, 220),
      layout: (['center', 'top', 'bottom'] as const).find((v) => v === s.layout) ?? 'center',
      transition: (['cut', 'fade', 'slide', 'zoom'] as const).find((v) => v === s.transition) ?? 'fade',
      motion: (['none', 'kenburns', 'pop', 'slide-up', 'glass'] as const).find((v) => v === s.motion) ?? 'none',
      background: (['brand', 'dark', 'light', 'source'] as const).find((v) => v === s.background) ?? 'brand',
      muted: s.muted === true,
    });
  }
  if (!scenes.length) throw new Error('A IA não montou nenhuma cena válida com os arquivos escolhidos.');
  const music = typeof p.musicSourceId === 'string' ? byId.get(p.musicSourceId) : undefined;
  return {
    title: str(p.title, 90) || 'Produção',
    summary: str(p.summary, 600),
    direction: str(p.direction, 600),
    scenes,
    captions: (['dinamica', 'simples', 'nenhuma'] as const).find((v) => v === p.captions) ?? 'nenhuma',
    musicSourceId: music && (music.kind === 'audio' || music.kind === 'video') ? music.id : null,
    musicVolume: num(p.musicVolume, 0, 1, 0.35),
    notes: str(p.notes, 800),
  };
}

/** Primeiras cores #hex do texto livre de cores da marca. */
export function brandColors(text: string) {
  const list = [...new Set((text.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? []).map((c) => c.toLowerCase()))];
  return list.slice(0, 6);
}

export type JobRow = {
  id: string;
  workspaceId: string;
  brandId: string;
  title: string;
  status: JobStatus;
  stage: string;
  progress: number;
  request: string;
  analysis: string | null;
  plan: string | null;
  version: number;
  rootId: string;
  parentId: string | null;
  outputs: string;
  error: string;
  attempts: number;
  lockedBy: string | null;
  lockedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  sourceRef: string | null;
};

export type JobOutput = { assetId: string; format: string; width: number; height: number; duration: number; mime: string; kind: 'video' | 'captions' };

/** Como a tela vê uma produção (sem a análise bruta). */
export function publicJob(j: JobRow) {
  const parse = <T,>(s: string | null, d: T): T => {
    try {
      return s ? (JSON.parse(s) as T) : d;
    } catch {
      return d;
    }
  };
  return {
    id: j.id,
    brandId: j.brandId,
    title: j.title,
    status: j.status,
    stage: j.stage,
    progress: j.progress,
    request: parse<VideoRequest | null>(j.request, null),
    plan: parse<EditPlan | null>(j.plan, null),
    version: j.version,
    rootId: j.rootId,
    parentId: j.parentId,
    outputs: parse<JobOutput[]>(j.outputs, []),
    error: j.error,
    createdBy: j.createdBy,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
    finishedAt: j.finishedAt,
    sourceRef: parse<{ planning?: { postId: string; date: string; title: string; caption: string } } | null>(j.sourceRef, null),
  };
}

export const WORKER_ONLINE_MS = 60_000;
/** Produção parada (worker caiu) volta para a fila depois disto; 3 tentativas no máximo. */
export const STALE_MS = 20 * 60_000;
export const MAX_ATTEMPTS = 3;
