'use client';
import { Login } from './login';
import { WorkspaceMenu } from './workspace-menu';
import { Notifications } from './notifications';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  X,
  LoaderCircle,
  ChevronDown,
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
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Dashboard } from './dashboard';
import { Brands } from './brands';
import { LibraryView } from './library';
import { Planning } from './planning';
import { Contents, Calendar } from './contents';
import { Studio } from './studio';
import { Integrations, Settings } from './settings';
import { ContentForm } from './forms';
import { today } from '@/lib/types';
import { activeState } from '@/lib/brand-lifecycle';
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
  const [month, setMonth] = useState(() => today().slice(0, 7));
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
  const [loginRequired, setLoginRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  // Unsaved Studio text: navigation away asks before discarding it.
  const [studioDirty, setStudioDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState<{
    view: View;
    details: Record<string, string>;
  } | null>(null);
  // Every screen except Marcas works without inactive brands and their data.
  const visible = useMemo(() => (state ? activeState(state) : null), [state]);
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
        if (response.status === 401 && (result as State & {loginRequired?: boolean}).loginRequired) setLoginRequired(true);
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
  const go = useCallback(
    (v: View, details: Record<string, string> = {}) => {
      setView(v);
      if (v === 'Biblioteca') setLibraryBrand(details.brand || '');
      if (v === 'Studio' && details.id) setSelected(details.id);
      const params = new URLSearchParams({ month, ...details });
      window.history.pushState(
        null,
        '',
        '#' + encodeURIComponent(v) + '?' + params.toString(),
      );
    },
    [month],
  );
  const navigate = useCallback(
    (v: View, details: Record<string, string> = {}) => {
      if (view === 'Studio' && studioDirty) {
        setPendingNav({ view: v, details });
        return;
      }
      go(v, details);
    },
    [go, view, studioDirty],
  );
  useEffect(() => {
    const restore = () => {
      try {
        const [raw, query] = window.location.hash.slice(1).split('?');
        const name = decodeURIComponent(raw),
          params = new URLSearchParams(query || '');
        if (nav.some(([v]) => v === name) || name === 'Studio')
          setView(name as View);
        else if (name) {
          setView('Dashboard');
          setMessage('Página não encontrada. Você voltou ao Dashboard.');
        }
        setSelected(params.get('id') || '');
        setLibraryBrand(params.get('brand') || '');
        const restoredMonth = params.get('month');
        if (restoredMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(restoredMonth))
          setMonth(restoredMonth);
      } catch {
        setView('Dashboard');
      }
    };
    restore();
    window.addEventListener('popstate', restore);
    window.addEventListener('hashchange', restore);
    return () => {
      window.removeEventListener('popstate', restore);
      window.removeEventListener('hashchange', restore);
    };
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
      body: JSON.stringify({
        action,
        data: {
          ...data,
          ...([
            'editContent',
            'saveVersion',
            'status',
            'deleteContent',
            'setAttachments',
          ].includes(action)
            ? {
                expectedRevision:
                  state?.contents.find((c) => c.id === data.id)?.revision ?? 0,
              }
            : {}),
        },
      }),
    });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) {
      if (response.status === 409) await reload();
      throw new Error(result.error);
    }
    await reload();
    setMessage(
      action === 'setBrandStatus'
        ? data.status === 'inactive'
          ? 'Marca inativada. Ela saiu das telas e da criação; os dados foram mantidos.'
          : 'Marca reativada.'
        : action === 'deleteBrand'
          ? 'Marca movida para a lixeira. Você pode restaurá-la por 30 dias.'
          : action === 'restoreBrand'
            ? 'Marca restaurada.'
            : action === 'setAttachments'
              ? 'Anexos da peça atualizados.'
              : action === 'saveVersion'
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
            if (!visible?.brands.length) {
              navigate('Marcas');
              return { opened: true, saved: false };
            }
            setForm({});
            return { opened: true, saved: false };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
    return () => lifecycle.abort();
  }, [visible?.brands.length, navigate]);
  const open = (c: Content) => {
    navigate('Studio', { id: c.id });
  };
  const create = (date?: string, brandId?: string) => {
    if (!visible?.brands.length) {
      navigate('Marcas');
      return;
    }
    setForm({ date, brandId });
  };
  const library = (id: string) => {
    setLibraryBrand(id);
    navigate('Biblioteca', { brand: id });
  };
  const item = visible?.contents.find((c) => c.id === selected);
  if (loginRequired) return <Login />;
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
          <WorkspaceMenu state={state} reload={reload}/>
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
                    !!visible?.contents.filter((c) => c.status === 'APROVAÇÃO')
                      .length && (
                      <span className="nav-badge">
                        {
                          visible.contents.filter((c) => c.status === 'APROVAÇÃO')
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
            <span className="live-dot" /> Workspace privado
          </div>
          <button className="profile" onClick={() => navigate('Configurações')}>
            <span className="avatar">
              {state?.user?.avatarUrl ? (
                <Image
                  unoptimized
                  src={state.user.avatarUrl}
                  width={36}
                  height={36}
                  alt={state.user.name}
                />
              ) : (
                state?.user?.name?.slice(0, 2).toUpperCase() || 'CO'
              )}
            </span>
            <span>
              {state?.user?.name || 'Minha conta'}
              <small>Administrador</small>
            </span>
            <ChevronDown size={15} />
          </button>
          {state?.user?.id === 'owner' && <button className="text-sm p-2" onClick={async () => { const response = await fetch('/api/session', {method:'DELETE'}); if (response.ok) window.location.reload(); else setError('Não foi possível sair. Tente novamente.'); }}>Sair da conta</button>}
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
                const [path, query] = window.location.hash.split('?');
                const params = new URLSearchParams(query || '');
                params.set('month', e.target.value);
                window.history.replaceState(
                  null,
                  '',
                  (path || '#Dashboard') + '?' + params.toString(),
                );
              }}
            />
            {state && <Notifications/>}
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
          ) : loading || !state || !visible ? (
            <output className="loading-state">
              <LoaderCircle className="animate-spin" /> Abrindo seu workspace…
            </output>
          ) : !visible.brands.length &&
            !['Marcas', 'Configurações', 'Integrações'].includes(view) ? (
            state.brands.length ? (
              <section className="panel">
                <p className="eyebrow">MARCAS INATIVAS</p>
                <h1>Todas as marcas estão inativas</h1>
                <p className="muted">
                  Reative uma marca ou cadastre uma nova para voltar a planejar
                  e criar.
                </p>
                <button
                  type="button"
                  className="create-btn"
                  onClick={() => navigate('Marcas')}
                >
                  Ir para Marcas
                </button>
              </section>
            ) : (
            <section className="panel">
              <p className="eyebrow">COMECE AQUI</p>
              <h1>Seu workspace está pronto para a primeira marca</h1>
              <p className="muted">
                Cadastre a identidade, os pilares e os arquivos da marca para
                começar o planejamento e a criação.
              </p>
              <button
                type="button"
                className="create-btn"
                aria-label="Cadastrar primeira marca"
                onClick={() => navigate('Marcas')}
              >
                Cadastrar primeira marca
              </button>
            </section>
            )
          ) : view === 'Dashboard' ? (
            <Dashboard
              state={visible}
              month={month}
              open={open}
              navigate={navigate}
            />
          ) : view === 'Marcas' ? (
            <Brands
              state={state}
              act={act}
              open={open}
              reload={reload}
              month={month}
              create={create}
            />
          ) : view === 'Biblioteca' ? (
            <LibraryView
              state={visible}
              act={act}
              reload={reload}
              initialBrand={libraryBrand}
            />
          ) : view === 'Planejamento' ? (
            <Planning
              key={month}
              state={visible}
              month={month}
              act={act}
              open={open}
              create={create}
            />
          ) : view === 'Calendário' ? (
            <Calendar
              key={month}
              state={visible}
              month={month}
              open={open}
              create={create}
            />
          ) : view === 'Conteúdos' || view === 'Aprovações' ? (
            <Contents
              act={act}
              reload={reload}
              key={view}
              state={visible}
              month={month}
              open={open}
              create={create}
              approvals={view === 'Aprovações'}
            />
          ) : view === 'Studio' && !item && selected ? (
            <section className="panel" role="alert">
              <h1>Conteúdo não encontrado</h1>
              <p className="muted">
                Este conteúdo não existe, foi movido para a lixeira ou pertence
                a outro workspace.
              </p>
              <button className="outline-btn" onClick={() => navigate('Conteúdos')}>
                Ir para Conteúdos
              </button>
            </section>
          ) : view === 'Studio' && item ? (
            <Studio
              reload={reload}
              key={
                item.id +
                '-' +
                visible.versions.filter((v) => v.contentId === item.id).length
              }
              state={visible}
              item={item}
              act={act}
              back={() =>
                navigate('Marcas', { brand: item.brandId, tab: 'contents' })
              }
              edit={(c) => setForm({ initial: c })}
              library={library}
              onDirtyChange={setStudioDirty}
            />
          ) : view === 'Integrações' ? (
            <Integrations state={visible} />
          ) : view === 'Configurações' ? (
            <Settings state={state} reload={reload} />
          ) : (
            <Contents state={visible} month={month} open={open} create={create} act={act} reload={reload} />
          )}
        </main>
      </SidebarInset>
      {form && visible && (
        <ContentForm
          state={visible}
          {...form}
          act={act}
          onClose={() => setForm(null)}
          onSaved={(date) => {
            // Follow the piece to its month so it never "disappears".
            const target = date.slice(0, 7);
            if (/^\d{4}-(0[1-9]|1[0-2])$/.test(target) && target !== month) {
              setMonth(target);
              const [path, query] = window.location.hash.split('?');
              const params = new URLSearchParams(query || '');
              params.set('month', target);
              window.history.replaceState(
                null,
                '',
                (path || '#Dashboard') + '?' + params.toString(),
              );
              setMessage(
                'Pauta salva em ' +
                  new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', {
                    month: 'long',
                    year: 'numeric',
                  }) +
                  '. Mostrando esse mês.',
              );
            }
          }}
        />
      )}{' '}
      <AlertDialog
        open={!!pendingNav}
        onOpenChange={(open) => !open && setPendingNav(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair sem salvar?</AlertDialogTitle>
            <AlertDialogDescription>
              Há textos ou arte alterados no Studio que ainda não viraram uma
              nova versão. Se sair agora, essas alterações serão perdidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const next = pendingNav;
                setPendingNav(null);
                setStudioDirty(false);
                if (next) go(next.view, next.details);
              }}
            >
              Descartar e sair
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
