'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  Clapperboard,
  Cpu,
  Download,
  FolderOpen,
  History,
  Library,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  Upload,
} from 'lucide-react';
import type { Action, Asset, State } from '@/lib/types';
import { PautaPicker, pautaBriefing, type Pauta } from './pauta-picker';
import { directUpload } from '@/lib/client-upload';

/**
 * Video & Motion: a pessoa diz o que quer criar; a IA escreve o plano de edição e o worker do
 * OxyVideo (no Mac da agência) produz com Remotion. Tudo aqui é real: status do worker, fila,
 * progresso e vídeo vêm do worker. Nada é publicado: a versão pronta vai para revisão.
 */

const TYPES = [
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
];
const FORMATS = [
  { key: 'vertical', label: 'Vertical', size: '1080 × 1920' },
  { key: 'horizontal', label: 'Horizontal', size: '1920 × 1080' },
  { key: 'feed', label: 'Feed', size: '1080 × 1350' },
  { key: 'quadrado', label: 'Quadrado', size: '1080 × 1080' },
  { key: '4k', label: '4K', size: '3840 × 2160' },
  { key: 'custom', label: 'Personalizado', size: '' },
];
const STYLES = ['Liquid Glass', 'Minimalista', 'Energético', 'Corporativo', 'Cinematográfico', 'Divertido'];
const QUALITIES = [
  { key: 'previa', label: 'Prévia rápida' },
  { key: 'alta', label: 'Alta' },
  { key: 'maxima', label: 'Máxima' },
];
const EXAMPLES = [
  'Deixe a abertura mais impactante.',
  'Reduza o vídeo para 30 segundos.',
  'Adicione legendas dinâmicas.',
  'Remova os primeiros cinco segundos.',
  'Use mais efeitos de Motion Graphics.',
  'Anime o logotipo em Liquid Glass.',
];
const ENGINES: { key: string; label: string }[] = [
  { key: 'remotion', label: 'Remotion' },
  { key: 'ffmpeg', label: 'FFmpeg' },
  { key: 'whisper', label: 'Faster Whisper' },
  { key: 'gsap', label: 'GSAP' },
  { key: 'three', label: 'Three.js / R3F' },
  { key: 'blender', label: 'Blender' },
  { key: 'python', label: 'Python' },
];

type Engine = { ok: boolean; version?: string; detail?: string };
type FolderFile = { path: string; kind: string; size: number };
type Worker = {
  id: string;
  name: string;
  online: boolean;
  lastSeen: string;
  version?: string;
  busy?: boolean;
  engines?: Record<string, Engine>;
  folders?: { id: string; name: string; files: FolderFile[]; truncated?: boolean }[];
};
type Output = { assetId: string; format: string; width: number; height: number; duration: number; mime: string; kind: 'video' | 'captions' };
type Plan = { title: string; summary: string; direction: string; scenes: { kind: string; duration: number; headline: string }[]; notes: string; captions: string };
type Job = {
  id: string;
  brandId: string;
  title: string;
  status: 'queued' | 'running' | 'review' | 'approved' | 'failed' | 'cancelled';
  stage: string;
  progress: number;
  request: { type: string; formats: { key: string; width: number; height: number }[]; briefing: string; revision: string } | null;
  plan: Plan | null;
  version: number;
  rootId: string;
  outputs: Output[];
  error: string;
  createdBy: string;
  createdAt: string;
  sourceRef: { planning?: { postId: string; date: string; title: string; caption: string } } | null;
};
type Payload = { configured: boolean; workers: Worker[]; queue: number; jobs: Job[] };

const STATUS: Record<Job['status'], { label: string; cls: string }> = {
  queued: { label: 'Na fila', cls: 'bg-[#fef3c7] text-[#b45309]' },
  running: { label: 'Produzindo', cls: 'bg-[#ebe4ff] text-[#4700ff]' },
  review: { label: 'Para revisão', cls: 'bg-[#fef3c7] text-[#b45309]' },
  approved: { label: 'Aprovada', cls: 'bg-[#dcfce7] text-[#15803d]' },
  failed: { label: 'Falhou', cls: 'bg-[#fde2ea] text-[#b4235a]' },
  cancelled: { label: 'Cancelada', cls: 'bg-[rgb(15_21_64/.06)] text-[#4a505c]' },
};

const field = 'w-full rounded-[12px] border border-[rgb(15_21_64/.08)] bg-white px-3 py-2 text-[14px] text-[#262b36] outline-none focus:border-[#4700ff]';
const label = 'mb-1 block text-[13px] font-semibold text-[#4a505c]';
const pill = (on: boolean) =>
  'inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold transition-colors ' +
  (on ? 'bg-white text-[#262b36] shadow-[0_0_0_.5px_rgb(15_21_64/.08),0_4px_10px_-6px_rgb(15_21_64/.18)]' : 'text-[#4a505c] hover:bg-[rgb(15_21_64/.05)]');
const chip = (on: boolean) =>
  'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-semibold transition-colors ' +
  (on ? 'border-[#4700ff] bg-[#ebe4ff] text-[#4700ff]' : 'border-[rgb(15_21_64/.1)] bg-white text-[#4a505c] hover:border-[rgb(15_21_64/.25)]');
const kindOf = (mime: string) => (mime.startsWith('video/') ? 'video' : mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio' : 'other');
const KIND_LABEL: Record<string, string> = { video: 'Vídeo', image: 'Imagem', audio: 'Áudio', other: 'Arquivo' };
const ago = (iso: string) => {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  return s < 60 ? `há ${s}s` : s < 3600 ? `há ${Math.round(s / 60)} min` : new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
};

export function VideoMotion({ state, act, reload }: { state: State; act: Action; reload: () => void }) {
  const brands = state.brands;
  const [brandId, setBrandId] = useState(brands[0]?.id || '');
  const brand = brands.find((b) => b.id === brandId);
  const [data, setData] = useState<Payload | null>(null);
  const [loadError, setLoadError] = useState('');
  const [type, setType] = useState(TYPES[0]);
  const [formats, setFormats] = useState<string[]>(['vertical']);
  const [custom, setCustom] = useState({ width: 1080, height: 1920 });
  const [duration, setDuration] = useState(30);
  const [language, setLanguage] = useState('pt-BR');
  const [captions, setCaptions] = useState(true);
  const [musicId, setMusicId] = useState('');
  const [narration, setNarration] = useState(false);
  const musicInput = useRef<HTMLInputElement>(null);
  const [style, setStyle] = useState(STYLES[0]);
  const [quality, setQuality] = useState('alta');
  const [briefing, setBriefing] = useState('');
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [folderSel, setFolderSel] = useState<Record<string, string[]>>({});
  const [origin, setOrigin] = useState<'upload' | 'library' | 'folder' | 'previous'>('library');
  const [pauta, setPauta] = useState<Pauta | null>(null);
  const [notice, setNotice] = useState('');
  const [uploading, setUploading] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [format, setFormat] = useState('');
  const [instructions, setInstructions] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/video', { cache: 'no-store' });
      const d = (await r.json()) as Payload & { error?: string };
      if (!r.ok) throw new Error(d.error || 'Falha ao carregar.');
      setData(d);
      setLoadError('');
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Falha ao carregar.');
    }
  }, []);
  const active = !!data?.jobs.some((j) => j.status === 'queued' || j.status === 'running');
  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), active ? 4000 : 15000);
    return () => window.clearInterval(t);
  }, [load, active]);

  const worker = data?.workers.find((w) => w.online) ?? data?.workers[0];
  const online = !!worker?.online;
  const media = useMemo(
    () => state.assets.filter((a) => a.brandId === brandId && ['video', 'image', 'audio'].includes(kindOf(a.mime))),
    [state.assets, brandId],
  );
  const audios = media.filter((a) => kindOf(a.mime) === 'audio');
  const jobs = (data?.jobs ?? []).filter((j) => j.brandId === brandId);
  const roots = jobs.filter((j, i) => jobs.findIndex((x) => x.rootId === j.rootId) === i); // última versão de cada produção
  const job = jobs.find((j) => j.id === selected) ?? roots[0];
  const versions = job ? jobs.filter((j) => j.rootId === job.rootId) : [];
  const videos = job?.outputs.filter((o) => o.kind === 'video') ?? [];
  const out = videos.find((o) => o.format === format) ?? videos[0];
  const previousOutputs = (data?.jobs ?? [])
    .filter((j) => j.brandId === brandId && (j.status === 'review' || j.status === 'approved'))
    .flatMap((j) => j.outputs.filter((o) => o.kind === 'video').map((o) => ({ ...o, job: j })));
  const folderFiles = Object.values(folderSel).reduce((n, l) => n + l.length, 0);
  const total = assetIds.length + folderFiles;

  const toggleAsset = (id: string) => setAssetIds((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const toggleFormat = (k: string) => setFormats((l) => (l.includes(k) ? l.filter((x) => x !== k) : [...l, k]));
  const toggleFolderFile = (folder: string, path: string) =>
    setFolderSel((s) => {
      const cur = s[folder] ?? [];
      return { ...s, [folder]: cur.includes(path) ? cur.filter((p) => p !== path) : [...cur, path].slice(0, 80) };
    });

  async function upload(files: FileList) {
    if (!brandId) return;
    setError('');
    for (const file of Array.from(files)) {
      try {
        setUploading(file.name);
        const a = await directUpload(file, brandId, { name: file.name, category: 'material', description: 'Video & Motion · arquivo enviado para produção' }, (p) => setUploading(`${file.name} · ${p}%`));
        setAssetIds((l) => [...l, a.id]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Falha no envio.');
      }
    }
    setUploading('');
    reload();
  }

  async function uploadMusic(file: File) {
    if (!brandId) return;
    setError('');
    try {
      setUploading(file.name);
      const a = await directUpload(file, brandId, { name: file.name, category: 'material', description: 'Video & Motion · trilha sonora' }, (p) => setUploading(`${file.name} · ${p}%`));
      setMusicId(a.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha no envio.');
    }
    setUploading('');
    reload();
  }

  async function post(body: Record<string, unknown>, what: string) {
    setBusy(what);
    setError('');
    try {
      const r = await fetch('/api/video', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = (await r.json()) as { ok?: boolean; id?: string; error?: string };
      if (!r.ok) throw new Error(d.error || 'Falha.');
      await load();
      return d;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha.');
      return null;
    } finally {
      setBusy('');
    }
  }

  async function create() {
    const d = await post(
      {
        action: 'create',
        brandId,
        request: {
          type,
          formats: formats.map((k) => (k === 'custom' ? { key: k, ...custom } : { key: k })),
          durationSeconds: duration,
          language,
          captions,
          music: musicId ? 'source' : 'none',
          musicAssetId: musicId || null,
          narration,
          style,
          quality,
          briefing,
          assetIds,
          folders: Object.entries(folderSel)
            .filter(([, files]) => files.length)
            .map(([id, files]) => ({ id, files })),
        },
        sourceRef: pauta ? JSON.stringify({ planning: { postId: pauta.postId, date: pauta.date, title: pauta.title || pauta.theme, caption: pauta.caption } }) : null,
      },
      'create',
    );
    if (d?.id) setSelected(d.id);
  }

  /** Aprova; com pauta do OxyPlanning, cria a peça (Vídeo) e envia como nova versão da publicação. */
  async function approve(j: Job) {
    const ok = await post({ action: 'approve', id: j.id }, 'approve');
    if (!ok) return;
    const ref = j.sourceRef?.planning;
    if (!ref) return setNotice('Versão aprovada. O vídeo está na biblioteca da marca (Peças enviadas).');
    setBusy('approve');
    try {
      const contentId = crypto.randomUUID();
      await act('createExternal', {
        id: contentId,
        brandId: j.brandId,
        title: (ref.title || j.title || 'Vídeo').slice(0, 200),
        date: ref.date,
        format: 'Vídeo',
        brief: (j.request?.briefing || '').slice(0, 2000),
        headline: j.plan?.title || ref.title || j.title,
        copy: j.plan?.direction || '',
        caption: ref.caption || '',
        media: j.outputs.filter((o) => o.kind === 'video').map((o) => o.assetId),
        change: `Video & Motion · versão ${j.version}`,
      });
      const r = await fetch('/api/openai/studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'planning', contentId, postId: ref.postId }),
      });
      const d = (await r.json().catch(() => ({}))) as { planning?: string; error?: string };
      if (!r.ok) throw new Error(d.error || 'Falha ao enviar ao OxyPlanning.');
      setNotice(`Vídeo aprovado e enviado para a pauta “${ref.title || 'sem título'}” de ${d.planning} no OxyPlanning, para aprovação do cliente.`);
      reload();
    } catch (e) {
      setError(`Versão aprovada aqui, mas não foi para o OxyPlanning: ${e instanceof Error ? e.message : 'falha'}.`);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="space-y-5">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{brand?.name || 'OxyStudio'}</p>
          <h1>Video &amp; Motion</h1>
          <p>Diga o que quer criar. A IA monta o roteiro e o OxyVideo edita, anima e renderiza de verdade. A versão pronta fica para revisão.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Marca" value={brandId} onChange={(e) => (setBrandId(e.target.value), setAssetIds([]), setMusicId(''), setSelected(''), setPauta(null))} className="h-11 rounded-full border border-[rgb(15_21_64/.08)] bg-white px-4 text-[14px] font-semibold">
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <WorkerCard data={data} worker={worker} loadError={loadError} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        {/* Pedido */}
        <section className="glass space-y-5 rounded-[22px] p-5">
          <h2 className="flex items-center gap-2 text-[15px] font-bold">
            <Clapperboard size={18} className="text-[#4700ff]" /> Nova produção
          </h2>

          <PautaPicker
            brandId={brandId}
            selected={pauta}
            only="video"
            onPick={(p) => {
              setPauta(p);
              if (!p) return;
              setBriefing(pautaBriefing(p) + '\n\nO que mais você quer no vídeo: ');
              if (p.format === 'reel' || p.format === 'story') setType('Reels e Stories');
              setFormats(['vertical']);
            }}
          />

          <div>
            <span className={label}>Conteúdos ({total} escolhido{total === 1 ? '' : 's'})</span>
            <div className="flex flex-wrap gap-1 rounded-[18px] bg-[rgb(15_21_64/.05)] p-1">
              {(
                [
                  ['library', 'Biblioteca', Library],
                  ['upload', 'Enviar arquivos', Upload],
                  ['folder', 'Pasta do computador', FolderOpen],
                  ['previous', 'Produções anteriores', History],
                ] as const
              ).map(([k, l, Icon]) => (
                <button key={k} type="button" className={pill(origin === k)} onClick={() => setOrigin(k)}>
                  <Icon size={15} /> {l}
                </button>
              ))}
            </div>
            <div className="mt-3">
              {origin === 'library' ? (
                media.length ? (
                  <div className="grid max-h-[300px] grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-6 2xl:grid-cols-8">
                    {media.map((a) => (
                      <AssetTile key={a.id} a={a} on={assetIds.includes(a.id)} onClick={() => toggleAsset(a.id)} />
                    ))}
                  </div>
                ) : (
                  <p className="text-[13.5px] text-[#737985]">Nenhum vídeo, imagem ou áudio na biblioteca desta marca. Envie arquivos na aba ao lado.</p>
                )
              ) : origin === 'upload' ? (
                <div className="space-y-2">
                  <button type="button" className="outline-btn" disabled={!!uploading || !brandId} onClick={() => fileInput.current?.click()}>
                    {uploading ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />} {uploading ? `Enviando ${uploading}` : 'Escolher arquivos'}
                  </button>
                  <input ref={fileInput} type="file" multiple hidden accept="video/mp4,video/quicktime,video/webm,image/png,image/jpeg,image/webp,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav" onChange={(e) => e.target.files && void upload(e.target.files)} />
                  <p className="text-[13px] text-[#737985]">Vídeos, imagens e áudios até 500 MB cada. Ficam na biblioteca da marca (categoria Materiais) e já entram na produção.</p>
                </div>
              ) : origin === 'folder' ? (
                <FolderPicker worker={worker} selection={folderSel} toggle={toggleFolderFile} setAll={(id, files) => setFolderSel((s) => ({ ...s, [id]: files }))} />
              ) : origin === 'previous' ? (
                previousOutputs.length ? (
                  <ul className="max-h-[240px] space-y-1.5 overflow-y-auto pr-1">
                    {previousOutputs.map((o) => (
                      <li key={o.assetId}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-[12px] bg-white/70 px-3 py-2 text-[13.5px]">
                          <input type="checkbox" checked={assetIds.includes(o.assetId)} onChange={() => toggleAsset(o.assetId)} className="accent-[#4700ff]" />
                          <span className="min-w-0 flex-1 truncate font-semibold">{o.job.title}</span>
                          <span className="text-[#737985]">
                            {o.format} · v{o.job.version}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13.5px] text-[#737985]">Ainda não há produções prontas desta marca.</p>
                )
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={label}>Tipo de produção</span>
              <select value={type} onChange={(e) => setType(e.target.value)} className={field}>
                {TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>Estilo visual</span>
              <select value={style} onChange={(e) => setStyle(e.target.value)} className={field}>
                {STYLES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <span className={label}>Formatos (pode escolher mais de um)</span>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map((f) => (
                <button key={f.key} type="button" className={chip(formats.includes(f.key))} onClick={() => toggleFormat(f.key)} aria-pressed={formats.includes(f.key)}>
                  {f.label}
                  {f.size ? <span className="font-normal opacity-70">{f.size}</span> : null}
                </button>
              ))}
            </div>
            {formats.includes('custom') ? (
              <div className="mt-2 flex items-center gap-2 text-[13.5px]">
                <input type="number" min={240} max={3840} value={custom.width} onChange={(e) => setCustom((c) => ({ ...c, width: Number(e.target.value) }))} className={field + ' !w-28'} aria-label="Largura" />×
                <input type="number" min={240} max={3840} value={custom.height} onChange={(e) => setCustom((c) => ({ ...c, height: Number(e.target.value) }))} className={field + ' !w-28'} aria-label="Altura" /> px
              </div>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className={label}>Duração (segundos)</span>
              <input type="number" min={5} max={600} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={field} />
            </label>
            <label className="block">
              <span className={label}>Idioma</span>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} className={field}>
                <option value="pt-BR">Português</option>
                <option value="en">Inglês</option>
                <option value="es">Espanhol</option>
              </select>
            </label>
            <label className="block">
              <span className={label}>Qualidade</span>
              <select value={quality} onChange={(e) => setQuality(e.target.value)} className={field}>
                {QUALITIES.map((q) => (
                  <option key={q.key} value={q.key}>
                    {q.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-[14px] font-semibold text-[#262b36]">
              <input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} className="size-4 accent-[#4700ff]" /> Legendas automáticas
            </label>
            <div className="block">
              <span className={label}>Trilha sonora</span>
              <select value={musicId} onChange={(e) => setMusicId(e.target.value)} className={field}>
                <option value="">Sem trilha</option>
                {audios.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <button type="button" className="mt-1.5 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#4700ff] disabled:opacity-50" disabled={!!uploading || !brandId} onClick={() => musicInput.current?.click()}>
                {uploading ? <LoaderCircle size={14} className="animate-spin" /> : <Upload size={14} />} {uploading ? `Enviando ${uploading}` : 'Enviar trilha (MP3, M4A, WAV)'}
              </button>
              <input ref={musicInput} type="file" hidden accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/aac" onChange={(e) => e.target.files?.[0] && void uploadMusic(e.target.files[0])} />
            </div>
            <div>
              <span className={label}>Narração</span>
              <label className="flex items-center gap-2 text-[14px] font-semibold text-[#262b36]">
                <input type="checkbox" checked={narration} onChange={(e) => setNarration(e.target.checked)} className="size-4 accent-[#4700ff]" /> Narrar com a voz do Mac
              </label>
              <span className="mt-1 block text-[12px] text-[#737985]">Voz Luciana, gravada no seu Mac, sem custo. A IA escreve a fala de cada cena.</span>
            </div>
          </div>

          <label className="block">
            <span className={label}>O que você deseja criar?</span>
            <textarea
              rows={6}
              value={briefing}
              onChange={(e) => setBriefing(e.target.value)}
              maxLength={6000}
              placeholder="Ex.: Reels de 30 s apresentando o novo serviço. Abertura forte com o produto, cortes rápidos, textos curtos com os benefícios e logo animado no final."
              className={field + ' resize-y'}
            />
          </label>

          {error ? <p className="rounded-[12px] bg-[#fde2ea] px-3 py-2 text-[13.5px] text-[#b4235a]">{error}</p> : null}
          {notice ? <p role="status" className="rounded-[12px] bg-[#dcfce7] px-3 py-2 text-[13.5px] text-[#15803d]">{notice}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="create-btn" disabled={!!busy || !brandId || !briefing.trim() || !formats.length} onClick={() => void create()}>
              {busy === 'create' ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />} Criar com IA
            </button>
            {!online ? <span className="text-[13px] text-[#b45309]">O worker está desligado: a produção fica na fila até ele voltar.</span> : null}
          </div>
        </section>

        {/* Produções */}
        <section className="glass space-y-4 rounded-[22px] p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-bold">Produções</h2>
            <button type="button" className="glass-btn grid size-9 place-items-center rounded-full" aria-label="Atualizar" onClick={() => void load()}>
              <RefreshCw size={15} />
            </button>
          </div>
          {!data && !loadError ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-[14px] bg-[rgb(15_21_64/.05)]" />
              ))}
            </div>
          ) : !roots.length ? (
            <p className="text-[13.5px] text-[#737985]">Nenhuma produção desta marca ainda. Preencha o pedido e clique em “Criar com IA”.</p>
          ) : (
            <ul className="max-h-[220px] space-y-1.5 overflow-y-auto pr-1">
              {roots.map((j) => (
                <li key={j.id}>
                  <button type="button" onClick={() => (setSelected(j.id), setFormat(''))} className={'flex w-full items-center gap-3 rounded-[14px] px-3 py-2 text-left ' + (job?.rootId === j.rootId ? 'bg-white shadow-[0_0_0_.5px_rgb(15_21_64/.08),0_4px_10px_-6px_rgb(15_21_64/.18)]' : 'hover:bg-[rgb(15_21_64/.04)]')}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">{j.title || j.request?.briefing.slice(0, 60)}</span>
                      <span className="block text-[12.5px] text-[#737985]">
                        {j.request?.type} · v{j.version} · {ago(j.createdAt)}
                      </span>
                    </span>
                    <StatusPill job={j} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {job ? (
            <div className="space-y-4 border-t border-[rgb(15_21_64/.06)] pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="min-w-0 flex-1 truncate text-[15px] font-bold">{job.title || 'Produção'}</h3>
                {versions.length > 1 ? (
                  <select aria-label="Versão" value={job.id} onChange={(e) => (setSelected(e.target.value), setFormat(''))} className="h-9 rounded-full border border-[rgb(15_21_64/.08)] bg-white px-3 text-[13px] font-semibold">
                    {versions.map((v) => (
                      <option key={v.id} value={v.id}>
                        Versão {v.version} · {STATUS[v.status].label}
                      </option>
                    ))}
                  </select>
                ) : null}
                <StatusPill job={job} />
              </div>

              {job.status === 'queued' || job.status === 'running' ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[13.5px]">
                    <span className="flex items-center gap-2 font-semibold">
                      <LoaderCircle size={15} className="animate-spin text-[#4700ff]" /> {job.stage}
                    </span>
                    <span className="tabular-nums text-[#737985]">{job.progress}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-[#ebe4ff]">
                    <div className="h-full rounded-full bg-[#4700ff] transition-[width] duration-500" style={{ width: `${Math.max(2, job.progress)}%` }} />
                  </div>
                  <button type="button" className="outline-btn danger" disabled={!!busy} onClick={() => void post({ action: 'cancel', id: job.id }, 'cancel')}>
                    <Ban size={15} /> Cancelar
                  </button>
                </div>
              ) : null}

              {job.status === 'failed' ? (
                <p className="rounded-[12px] bg-[#fde2ea] px-3 py-2 text-[13.5px] text-[#b4235a]">
                  <b>Falhou:</b> {job.error || 'sem detalhes.'} Ajuste o pedido e crie de novo.
                </p>
              ) : null}

              {out ? (
                <div className="space-y-2">
                  {videos.length > 1 ? (
                    <div className="flex flex-wrap gap-1 rounded-full bg-[rgb(15_21_64/.05)] p-1">
                      {videos.map((v) => (
                        <button key={v.assetId} type="button" className={pill(out.assetId === v.assetId)} onClick={() => setFormat(v.format)}>
                          {v.format}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <video key={out.assetId} controls playsInline preload="metadata" src={`/api/video/media/${out.assetId}`} className="mx-auto max-h-[520px] w-full rounded-[16px] bg-black" style={{ aspectRatio: `${out.width || 9} / ${out.height || 16}` }} />
                  <div className="flex flex-wrap items-center gap-2 text-[13px] text-[#737985]">
                    <span>
                      {out.width} × {out.height} · {out.duration.toFixed(1)} s
                    </span>
                    <a className="outline-btn" href={`/api/video/media/${out.assetId}?download=1`}>
                      <Download size={15} /> Baixar MP4
                    </a>
                    {job.outputs
                      .filter((o) => o.kind === 'captions')
                      .map((o) => (
                        <a key={o.assetId} className="outline-btn" href={`/api/assets/${o.assetId}?download=1`}>
                          <Download size={15} /> Legendas {o.format}
                        </a>
                      ))}
                  </div>
                </div>
              ) : null}

              {job.plan ? (
                <div className="space-y-2 rounded-[16px] bg-white/70 p-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[12px] font-semibold text-[#3a1fb8] shadow-[0_0_0_1px_rgb(15_21_64/.06)]">
                    <Sparkles size={13} /> Sugestão de IA
                  </span>
                  {job.plan.direction ? <p className="text-[13.5px] text-[#262b36]">{job.plan.direction}</p> : null}
                  <p className="text-[12.5px] text-[#737985]">
                    {job.plan.scenes.length} cenas · {job.plan.scenes.reduce((s, x) => s + x.duration, 0).toFixed(1)} s · legendas {job.plan.captions === 'nenhuma' ? 'não' : job.plan.captions}
                  </p>
                  {job.plan.notes ? <p className="text-[12.5px] text-[#4a505c]">Observações: {job.plan.notes}</p> : null}
                </div>
              ) : null}

              {job.status === 'review' || job.status === 'approved' ? (
                <div className="space-y-2">
                  <label className="block">
                    <span className={label}>O que mudar?</span>
                    <textarea rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={3000} placeholder="Ex.: Deixe a abertura mais impactante e reduza para 20 segundos." className={field + ' resize-y'} />
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {EXAMPLES.map((x) => (
                      <button key={x} type="button" className="rounded-full bg-white px-3 py-1 text-[12.5px] text-[#4a505c] shadow-[0_0_0_1px_rgb(15_21_64/.06)] hover:text-[#262b36]" onClick={() => setInstructions((t) => (t ? t + ' ' : '') + x)}>
                        {x}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="create-btn"
                      disabled={!!busy || !instructions.trim()}
                      onClick={async () => {
                        const d = await post({ action: 'revise', id: job.id, instructions }, 'revise');
                        if (d?.id) (setSelected(d.id), setInstructions(''), setFormat(''));
                      }}
                    >
                      {busy === 'revise' ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />} Pedir alteração
                    </button>
                    {job.status === 'review' ? (
                      <button type="button" className="outline-btn" disabled={!!busy} onClick={() => void approve(job)}>
                        {busy === 'approve' ? <LoaderCircle size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}{' '}
                        {job.sourceRef?.planning ? 'Aprovar e enviar ao OxyPlanning' : 'Aprovar'}
                      </button>
                    ) : null}
                  </div>
                  <p className="text-[12.5px] text-[#737985]">Cada alteração vira uma versão nova; as anteriores ficam guardadas. Os vídeos ficam na biblioteca da marca (Peças enviadas). Nada é publicado.</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function StatusPill({ job }: { job: Job }) {
  const s = STATUS[job.status];
  return (
    <span className={'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ' + s.cls}>
      <span className="size-1.5 rounded-full bg-current" /> {s.label}
    </span>
  );
}

function AssetTile({ a, on, onClick }: { a: Asset; on: boolean; onClick: () => void }) {
  const kind = kindOf(a.mime);
  return (
    <button type="button" onClick={onClick} aria-pressed={on} title={a.name} className={'relative overflow-hidden rounded-[12px] bg-white text-left ' + (on ? 'ring-2 ring-[#4700ff] ring-offset-2' : 'shadow-[0_0_0_1px_rgb(15_21_64/.06)]')}>
      {kind === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.url} alt="" className="aspect-square w-full object-cover" loading="lazy" />
      ) : (
        <span className="grid aspect-square w-full place-items-center bg-[#0f1540] text-[12px] font-semibold text-white">{KIND_LABEL[kind]}</span>
      )}
      <span className="block truncate px-2 py-1 text-[11.5px] text-[#4a505c]">{a.name}</span>
    </button>
  );
}

function WorkerCard({ data, worker, loadError }: { data: Payload | null; worker?: Worker; loadError: string }) {
  if (loadError)
    return (
      <section className="glass rounded-[22px] p-4 text-[13.5px] text-[#b4235a]">
        Não foi possível carregar o Video &amp; Motion: {loadError}
      </section>
    );
  if (!data) return <section className="glass h-[84px] animate-pulse rounded-[22px]" />;
  const engines = worker?.engines ?? {};
  return (
    <section className="glass flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[22px] p-4">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-[#ebe4ff] text-[#4700ff]">
          <Cpu size={18} />
        </span>
        <div>
          <p className="text-[14px] font-bold">
            Worker OxyVideo{' '}
            {!data.configured ? (
              <span className="ml-1 rounded-full bg-[#fef3c7] px-2 py-0.5 text-[12px] font-semibold text-[#b45309]">Aguardando integração</span>
            ) : worker?.online ? (
              <span className="ml-1 rounded-full bg-[#dcfce7] px-2 py-0.5 text-[12px] font-semibold text-[#15803d]">{worker.busy ? 'Produzindo' : 'Online'}</span>
            ) : (
              <span className="ml-1 rounded-full bg-[rgb(15_21_64/.06)] px-2 py-0.5 text-[12px] font-semibold text-[#4a505c]">Desligado</span>
            )}
          </p>
          <p className="text-[12.5px] text-[#737985]">
            {!data.configured
              ? 'Falta o token do worker (OXYVIDEO_WORKER_TOKEN) no OxyStudio.'
              : worker
                ? `${worker.name} · visto ${ago(worker.lastSeen)} · fila: ${data.queue}`
                : `O worker ainda não se conectou · fila: ${data.queue}`}
          </p>
        </div>
      </div>
      {worker ? (
        <div className="flex flex-wrap gap-1.5">
          {ENGINES.map((e) => {
            const s = engines[e.key];
            return (
              <span key={e.key} title={s?.version || s?.detail || ''} className={'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ' + (s?.ok ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-[rgb(15_21_64/.06)] text-[#4a505c]')}>
                <span className="size-1.5 rounded-full bg-current" /> {e.label}
                {!s?.ok ? ' · indisponível' : ''}
              </span>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function FolderPicker({
  worker,
  selection,
  toggle,
  setAll,
}: {
  worker?: Worker;
  selection: Record<string, string[]>;
  toggle: (folder: string, path: string) => void;
  setAll: (folder: string, files: string[]) => void;
}) {
  const [open, setOpen] = useState('');
  if (!worker?.online)
    return <p className="text-[13.5px] text-[#737985]">As pastas do computador aparecem aqui quando o worker do OxyVideo está ligado.</p>;
  const folders = worker.folders ?? [];
  if (!folders.length)
    return (
      <p className="text-[13.5px] text-[#737985]">
        Nenhuma pasta liberada. No Mac, coloque o caminho em <code>folders</code> no arquivo <code>~/oxyvideo/worker.config.json</code>. O worker só enxerga essas pastas e nunca altera os originais.
      </p>
    );
  const current = folders.find((f) => f.id === open) ?? folders[0];
  const media = current.files.filter((f) => f.kind !== 'other');
  const sel = selection[current.id] ?? [];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {folders.map((f) => (
          <button key={f.id} type="button" className={chip(current.id === f.id)} onClick={() => setOpen(f.id)}>
            <FolderOpen size={14} /> {f.name}
            {(selection[f.id]?.length ?? 0) > 0 ? <span className="rounded-full bg-[#4700ff] px-1.5 text-[11px] text-white">{selection[f.id].length}</span> : null}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 text-[13px]">
        <button type="button" className="font-semibold text-[#4700ff] hover:underline" onClick={() => setAll(current.id, media.slice(0, 80).map((f) => f.path))}>
          Selecionar todos
        </button>
        <button type="button" className="font-semibold text-[#4a505c] hover:underline" onClick={() => setAll(current.id, [])}>
          Limpar
        </button>
        <span className="text-[#737985]">
          {media.length} arquivo{media.length === 1 ? '' : 's'} de mídia{current.truncated ? ' (lista parcial)' : ''}
        </span>
      </div>
      <ul className="max-h-[220px] space-y-1 overflow-y-auto pr-1">
        {media.map((f) => (
          <li key={f.path}>
            <label className="flex cursor-pointer items-center gap-2 rounded-[10px] px-2 py-1.5 text-[13px] hover:bg-white/70">
              <input type="checkbox" checked={sel.includes(f.path)} onChange={() => toggle(current.id, f.path)} className="accent-[#4700ff]" />
              <span className="min-w-0 flex-1 truncate">{f.path}</span>
              <span className="text-[#737985]">
                {KIND_LABEL[f.kind] ?? f.kind} · {(f.size / 1048576).toFixed(1)} MB
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
