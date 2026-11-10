'use client';
import { useEffect, useRef, useState } from 'react';
import { Clapperboard, FileText, LayoutGrid, Radar, Workflow, type LucideIcon } from 'lucide-react';

/**
 * Menu "Oxyhub": volta ao painel único e troca de sistema sem novo login.
 * Os links passam pelo hub (/abrir/…), que abre cada sistema já logado.
 */
const HUB = (process.env.NEXT_PUBLIC_HUB_URL || 'https://hub.oxyhub.com.br').replace(/\/+$/, '');

type SystemId = 'aprovacao' | 'lead' | 'coody' | 'proposals';
const SYSTEMS: { id: SystemId; name: string; description: string; icon: LucideIcon }[] = [
  { id: 'aprovacao', name: 'Aprovação de conteúdo', description: 'Planejamento e aprovação', icon: Workflow },
  { id: 'lead', name: 'Lead Hunter', description: 'Prospecção e pipeline', icon: Radar },
  { id: 'coody', name: 'Coody', description: 'Workspace criativo', icon: Clapperboard },
  { id: 'proposals', name: 'Oxycom Proposals', description: 'Propostas comerciais', icon: FileText },
];
const CURRENT: SystemId = 'coody';

export function OxyhubSwitcher() {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, []);
  return (
    <div className="notification-wrap" ref={wrap}>
      <button
        className="notification-bell"
        aria-label="Sistemas Oxyhub"
        title="Sistemas Oxyhub"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(!open)}
      >
        <LayoutGrid size={21} />
      </button>
      {open && (
        <nav className="notification-popover" aria-label="Sistemas Oxyhub" style={{ padding: 8, width: 300 }}>
          <a href={HUB} className="flex items-center gap-3 rounded-xl px-3 py-2.5 no-underline hover:bg-white/5">
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#4700ff] text-white">
              <LayoutGrid size={18} />
            </span>
            <span className="min-w-0">
              <strong className="block text-sm">Painel Oxyhub</strong>
              <span className="block text-xs text-[#bbb0c4]">Pendências de todos os sistemas</span>
            </span>
          </a>
          <div className="my-1 h-px bg-[#3b3043]" />
          <p className="px-3 pt-1.5 pb-1 text-[11px] font-bold tracking-[0.12em] text-[#bbb0c4] uppercase">Sistemas</p>
          {SYSTEMS.map((s) => {
            const here = s.id === CURRENT;
            const Icon = s.icon;
            const body = (
              <>
                <span
                  className={
                    'grid size-9 shrink-0 place-items-center rounded-[10px] ' +
                    (here ? 'bg-[#b482db]/20 text-[#d7b8f0]' : 'bg-white/5 text-[#e6dcef]')
                  }
                >
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm font-semibold">{s.name}</strong>
                  <span className="block text-xs text-[#bbb0c4]">{here ? 'Você está aqui' : s.description}</span>
                </span>
                {here && <span className="size-2 shrink-0 rounded-full bg-[#b482db]" />}
              </>
            );
            return here ? (
              <div key={s.id} aria-current="page" className="flex items-center gap-3 rounded-xl px-3 py-2">
                {body}
              </div>
            ) : (
              <a key={s.id} href={`${HUB}/abrir/${s.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2 no-underline hover:bg-white/5">
                {body}
              </a>
            );
          })}
        </nav>
      )}
    </div>
  );
}
