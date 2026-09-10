'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  CalendarDays,
  CalendarRange,
  Layers,
  Shapes,
  CheckCheck,
  Library,
  Plug,
  Settings as SettingsIcon,
  Plus,
  ChevronDown,
  X,
  LoaderCircle,
} from 'lucide-react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarInset,
} from '@/components/ui/sidebar';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { Dashboard } from './dashboard';
import { Brands } from './brands';
import { LibraryView } from './library';
import { Planning } from './planning';
import { Contents, Calendar } from './contents';
import { Studio } from './studio';
import { Integrations, Settings } from './settings';
import { ContentForm } from './forms';
import type { View, State, Content, Action } from '@/lib/types';
const nav = [
  ['Dashboard', LayoutDashboard],
  ['Planejamento', CalendarRange],
  ['Calendário', CalendarDays],
  ['Conteúdos', Layers],
  ['Marcas', Shapes],
  ['Aprovações', CheckCheck],
  ['Biblioteca', Library],
  ['Integrações', Plug],
  ['Configurações', SettingsIcon],
] as const;
export default function Workspace() {
  const [view, setView] = useState<View>('Dashboard');
  const [month, setMonth] = useState('2026-09');
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState('');
  const [libraryBrand, setLibraryBrand] = useState('');
  const [form, setForm] = useState<{
    initial?: Content;
    date?: string;
    brandId?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    const response = await fetch('/api/workspace', { cache: 'no-store' });
    const result = (await response.json()) as State & { error?: string };
    if (!response.ok) throw new Error(result.error);
    setState(result);
    setError('');
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/workspace', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const result = (await response.json()) as State & { error?: string };
        if (!response.ok) throw new Error(result.error);
        return result;
      })
      .then(setState)
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);
  const navigate = useCallback((v: View) => {
    setView(v);
    window.history.pushState(null, '', '#' + encodeURIComponent(v));
  }, []);
  useEffect(() => {
    const restore = () => {
      const name = decodeURIComponent(window.location.hash.slice(1));
      if (nav.some(([v]) => v === name)) setView(name as View);
    };
    restore();
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);
  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(() => setMessage(''), 4500);
    return () => clearTimeout(timeout);
  }, [message]);
  const act: Action = async (action, data) => {
    const response = await fetch('/api/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, data }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) throw new Error(result.error);
    await reload();
    setMessage(
      action === 'saveVersion'
        ? 'Nova versão salva. O histórico foi preservado.'
        : action === 'status'
          ? 'Status atualizado.'
          : 'Alterações salvas.',
    );
  };
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifecycle = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: 'start_content_creation',
          title: 'Abrir criação de conteúdo',
          description:
            'Abre o formulário de nova pauta no COODY. Não salva nem gera conteúdo.',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: (input: unknown) => {
            if (
              !input ||
              typeof input !== 'object' ||
              Array.isArray(input) ||
              Object.keys(input).length
            )
              throw new Error('Envie um objeto vazio.');
            setForm({});
            return { opened: true, saved: false };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
    return () => lifecycle.abort();
  }, []);
  const open = (c: Content) => {
    setSelected(c.id);
    navigate('Studio');
  };
  const create = (date?: string, brandId?: string) =>
    setForm({ date, brandId });
  const library = (id: string) => {
    setLibraryBrand(id);
    navigate('Biblioteca');
  };
  const item = state?.contents.find((c) => c.id === selected);
  return (
    <SidebarProvider>
      <Sidebar className="coody-sidebar">
        <SidebarHeader>
          <Image
            unoptimized
            width={469}
            height={172}
            className="official-logo"
            src="/coody-logo.svg"
            alt="COODY"
          />
          <div className="workspace-name">
            <span className="workspace-icon">W</span>
            <span>
              Workspace da agência<small>Plano criativo · demonstração</small>
            </span>
            <ChevronDown size={14} />
          </div>
          <button
            className="create-btn"
            disabled={!state}
            onClick={() => create(month + '-15')}
          >
            <Plus size={18} /> Criar conteúdo
          </button>
        </SidebarHeader>
        <SidebarContent>
          <p className="nav-label">WORKSPACE</p>
          <SidebarMenu>
            {nav.map(([name, Icon]) => (
              <SidebarMenuItem key={name}>
                <SidebarMenuButton
                  isActive={
                    view === name || (view === 'Studio' && name === 'Conteúdos')
                  }
                  onClick={() => navigate(name)}
                >
                  <Icon />
                  <span>{name}</span>
                  {name === 'Aprovações' &&
                    !!state?.contents.filter((c) => c.status === 'APROVAÇÃO')
                      .length && (
                      <span className="nav-badge">
                        {
                          state.contents.filter((c) => c.status === 'APROVAÇÃO')
                            .length
                        }
                      </span>
                    )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter>
          <div className="demo-note">
            <span className="live-dot" /> Ambiente demonstrativo
          </div>
          <button className="profile" onClick={() => navigate('Configurações')}>
            <span className="avatar">AC</span>
            <span>
              Agência criativa<small>Administrador</small>
            </span>
            <ChevronDown size={15} />
          </button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger />
            <span>Workspace</span>
            <span>/</span>
            <strong>{view}</strong>
          </div>
          <div className="top-actions">
            <Input
              type="month"
              aria-label="Mês do workspace"
              className="month-input"
              value={month}
              onChange={(e) => {
                if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value))
                  setMonth(e.target.value);
              }}
            />
            <span className="avatar small">AC</span>
          </div>
        </header>
        <main className="workspace-main">
          {error ? (
            <div className="notice error" role="alert">
              {error}
              <button
                className="outline-btn"
                onClick={() => reload().catch((e) => setError(e.message))}
              >
                Tentar novamente
              </button>
            </div>
          ) : loading || !state ? (
            <output className="loading-state">
              <LoaderCircle className="animate-spin" /> Abrindo seu workspace…
            </output>
          ) : view === 'Dashboard' ? (
            <Dashboard
              state={state}
              month={month}
              open={open}
              navigate={navigate}
            />
          ) : view === 'Marcas' ? (
            <Brands state={state} act={act} open={open} library={library} />
          ) : view === 'Biblioteca' ? (
            <LibraryView
              state={state}
              act={act}
              reload={reload}
              initialBrand={libraryBrand}
            />
          ) : view === 'Planejamento' ? (
            <Planning
              key={month}
              state={state}
              month={month}
              act={act}
              open={open}
              create={create}
            />
          ) : view === 'Calendário' ? (
            <Calendar
              key={month}
              state={state}
              month={month}
              open={open}
              create={create}
            />
          ) : view === 'Conteúdos' || view === 'Aprovações' ? (
            <Contents
              key={view}
              state={state}
              month={month}
              open={open}
              create={create}
              approvals={view === 'Aprovações'}
            />
          ) : view === 'Studio' && item ? (
            <Studio
              key={
                item.id +
                '-' +
                state.versions.filter((v) => v.contentId === item.id).length
              }
              state={state}
              item={item}
              act={act}
              back={() => navigate('Conteúdos')}
              edit={(c) => setForm({ initial: c })}
              library={library}
            />
          ) : view === 'Integrações' ? (
            <Integrations />
          ) : view === 'Configurações' ? (
            <Settings />
          ) : (
            <Contents state={state} month={month} open={open} create={create} />
          )}
        </main>
      </SidebarInset>
      {form && state && (
        <ContentForm
          state={state}
          {...form}
          act={act}
          onClose={() => setForm(null)}
        />
      )}{' '}
      {message && (
        <output className="save-notice">
          {message}
          <button aria-label="Fechar aviso" onClick={() => setMessage('')}>
            <X size={14} />
          </button>
        </output>
      )}
    </SidebarProvider>
  );
}
