'use client';
import { useEffect, useState } from 'react';
import { CalendarDays, Check, LoaderCircle, X } from 'lucide-react';

/** Pauta do OxyPlanning que ainda precisa de arte (de /api/oxyplanning). */
export type Pauta = {
  postId: string;
  brandId: string;
  date: string;
  time: string | null;
  format: string;
  formatLabel: string | null;
  createFormat: string;
  planningStatus: string;
  title: string;
  theme: string;
  objective: string;
  artText: string;
  caption: string;
  campaign: string;
  hasArt: boolean;
};

const FORMAT: Record<string, string> = { static: 'Post', carousel: 'Carrossel', video: 'Vídeo', reel: 'Reels', story: 'Story' };
const day = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' }).replace('.', '');

/** Texto da pauta para o briefing do Diretor de Criação / Video & Motion. */
export function pautaBriefing(p: Pauta) {
  return [
    `Pauta do OxyPlanning para ${day(p.date)}${p.time ? ' às ' + p.time.slice(0, 5) : ''} (${p.formatLabel || FORMAT[p.format] || p.format}).`,
    p.title && `Título: ${p.title}`,
    p.theme && `Tema: ${p.theme}`,
    p.objective && `Objetivo: ${p.objective}`,
    p.campaign && `Campanha: ${p.campaign}`,
    p.artText && `Texto da arte / briefing: ${p.artText}`,
    p.caption && `Legenda prevista: ${p.caption}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Escolher uma pauta do OxyPlanning (cliente ligado à marca) para criar a arte ou o vídeo com as
 * informações dela. A peça pronta volta para a mesma publicação, como nova versão para aprovação.
 */
export function PautaPicker({
  brandId,
  selected,
  onPick,
  only,
}: {
  brandId: string;
  selected: Pauta | null;
  onPick: (p: Pauta | null) => void;
  /** 'video': só pautas de vídeo, reels e story; 'image': só post, carrossel e story. */
  only?: 'video' | 'image';
}) {
  const [data, setData] = useState<{ state: string; message?: string; links?: { brandId: string; clientName: string }[]; pautas?: Pauta[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setData(null);
    setError('');
    fetch('/api/oxyplanning', { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json();
        if (!alive) return;
        if (!r.ok && !d.state) throw new Error(d.error || 'OxyPlanning indisponível.');
        setData(d);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : 'OxyPlanning indisponível.'));
    return () => {
      alive = false;
    };
  }, [brandId]);

  const wrap = (children: React.ReactNode) => (
    <div className="space-y-2">
      <span className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-[#4a505c]">
        <CalendarDays size={15} /> Pauta do OxyPlanning
      </span>
      {children}
    </div>
  );

  if (selected)
    return wrap(
      <div className="flex items-start gap-3 rounded-[14px] bg-[#ebe4ff] px-3 py-2.5">
        <Check size={16} className="mt-0.5 shrink-0 text-[#4700ff]" />
        <div className="min-w-0 flex-1 text-[13.5px]">
          <p className="font-semibold text-[#262b36]">{selected.title || 'Pauta sem título'}</p>
          <p className="text-[#4a505c]">
            {day(selected.date)} · {selected.formatLabel || FORMAT[selected.format] || selected.format}
            {selected.theme ? ` · ${selected.theme}` : ''}
          </p>
          <p className="mt-0.5 text-[12.5px] text-[#4a505c]">A peça pronta volta para esta publicação no OxyPlanning, para aprovação do cliente.</p>
        </div>
        <button type="button" aria-label="Tirar a pauta" className="grid size-8 shrink-0 place-items-center rounded-full text-[#4a505c] hover:bg-white/70" onClick={() => onPick(null)}>
          <X size={15} />
        </button>
      </div>,
    );
  if (error) return wrap(<p className="text-[13px] text-[#b4235a]">Não foi possível ler as pautas: {error}</p>);
  if (!data)
    return wrap(
      <p className="flex items-center gap-2 text-[13px] text-[#737985]">
        <LoaderCircle size={14} className="animate-spin" /> Lendo as pautas…
      </p>,
    );
  if (data.state !== 'operacional')
    return wrap(
      <p className="text-[13px] text-[#737985]">
        <span className="mr-1.5 rounded-full bg-[#fef3c7] px-2 py-0.5 text-[12px] font-semibold text-[#b45309]">Aguardando integração</span>
        {data.message || 'OxyPlanning indisponível.'}
      </p>,
    );
  if (!data.links?.some((l) => l.brandId === brandId))
    return wrap(<p className="text-[13px] text-[#737985]">Esta marca não está ligada a um cliente do OxyPlanning. Um administrador liga em Marcas.</p>);
  const isVideo = (p: Pauta) => ['video', 'reel', 'story'].includes(p.format);
  const list = (data.pautas ?? [])
    .filter((p) => p.brandId === brandId && !p.hasArt && !['approved', 'published'].includes(p.planningStatus))
    .filter((p) => (only === 'video' ? isVideo(p) : only === 'image' ? !['video', 'reel'].includes(p.format) : true))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!list.length)
    return wrap(<p className="text-[13px] text-[#737985]">Nenhuma pauta {only === 'video' ? 'de vídeo ' : ''}sem arte a partir de hoje para este cliente. Você pode criar sem pauta.</p>);
  return wrap(
    <ul className="max-h-[200px] space-y-1 overflow-y-auto pr-1">
      {list.map((p) => (
        <li key={p.postId}>
          <button type="button" onClick={() => onPick(p)} className="flex w-full items-center gap-3 rounded-[12px] bg-white/70 px-3 py-2 text-left text-[13.5px] hover:bg-white">
            <span className="w-[92px] shrink-0 text-[12.5px] font-semibold text-[#4700ff]">{day(p.date)}</span>
            <span className="min-w-0 flex-1 truncate font-semibold text-[#262b36]">{p.title || p.theme || 'Pauta sem título'}</span>
            <span className="shrink-0 text-[12.5px] text-[#737985]">{p.formatLabel || FORMAT[p.format] || p.format}</span>
          </button>
        </li>
      ))}
    </ul>,
  );
}
