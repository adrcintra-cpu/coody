'use client';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Clapperboard, FileText, LayoutGrid, Radar, TrendingUp, Workflow, type LucideIcon } from 'lucide-react';

/**
 * Menu "Oxyhub": volta ao painel único e troca de sistema sem novo login.
 * Os links passam pelo hub (/abrir/…), que abre cada sistema já logado.
 */
const HUB = (process.env.NEXT_PUBLIC_HUB_URL || 'https://hub.oxyhub.com.br').replace(/\/+$/, '');

type SystemId = 'aprovacao' | 'lead' | 'coody' | 'proposals' | 'growth' | 'calendar';
const SYSTEMS: { id: SystemId; name: string; description: string; icon: LucideIcon }[] = [
  { id: 'aprovacao', name: 'OxyPlanning', description: 'Planejamento e aprovação', icon: Workflow },
  { id: 'lead', name: 'OxySDR', description: 'Prospecção e pipeline', icon: Radar },
  { id: 'coody', name: 'OxyCreate', description: 'Workspace criativo', icon: Clapperboard },
  { id: 'proposals', name: 'OxyProposal', description: 'Propostas comerciais', icon: FileText },
  { id: 'growth', name: 'OxyGrowth', description: 'Auditoria e crescimento', icon: TrendingUp },
  { id: 'calendar', name: 'OxyCalendar', description: 'Calendário integrado', icon: CalendarDays },
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
        <nav className="notification-popover" aria-label="Sistemas Oxyhub" style={{ padding: 8, width: 300, maxHeight: '80vh', overflowY: 'auto' }}>
          <a href={HUB} className="flex items-center gap-3 rounded-xl px-3 py-2.5 no-underline hover:bg-[#262b36]/5">
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#4700ff] text-white">
              <LayoutGrid size={18} />
            </span>
            <span className="min-w-0">
              <strong className="block text-sm text-[#262b36]">Painel Oxyhub</strong>
              <span className="block text-xs text-[#737985]">Pendências de todos os sistemas</span>
            </span>
          </a>
          <div className="my-1 h-px bg-[#e8e9ed]" />
          <p className="px-3 pt-1.5 pb-1 text-[11px] font-bold tracking-[0.12em] text-[#737985] uppercase">Sistemas</p>
          {SYSTEMS.map((s) => {
            const here = s.id === CURRENT;
            const Icon = s.icon;
            const body = (
              <>
                <span
                  className={
                    'grid size-9 shrink-0 place-items-center rounded-[10px] ' +
                    (here ? 'bg-[#f1ebff] text-[#4700ff]' : 'bg-[#262b36]/5 text-[#4a505c]')
                  }
                >
                  <Icon size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <strong className="block text-sm font-semibold text-[#262b36]">{s.name}</strong>
                  <span className="block text-xs text-[#737985]">{here ? 'Você está aqui' : s.description}</span>
                </span>
                {here && <span className="size-2 shrink-0 rounded-full bg-[#4700ff]" />}
              </>
            );
            return here ? (
              <div key={s.id} aria-current="page" className="flex items-center gap-3 rounded-xl px-3 py-2">
                {body}
              </div>
            ) : (
              <a key={s.id} href={s.id === 'calendar' ? `${HUB}/calendario` : `${HUB}/abrir/${s.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2 no-underline hover:bg-[#262b36]/5">
                {body}
              </a>
            );
          })}
        </nav>
      )}
    </div>
  );
}
