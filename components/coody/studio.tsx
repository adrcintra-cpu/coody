'use client';
import { ArtViewer } from './art-viewer';
import { MagnificGenerator } from './magnific';
import { ImageGenerator } from './openai';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Save,
  Send,
  Check,
  Lock,
  ImagePlus,
  GitCompareArrows,
  MessageSquare,
  ArrowUpRight,
  Trash2,
} from 'lucide-react';
import Image from 'next/image';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Field, FormModal } from './forms';
import { AssetEditor } from './library';
import { Picker, StatusBadge } from './shared';
import { buildBrandContext } from '@/lib/services';
import {
  type State,
  type Content,
  type Version,
  type Action,
  type Status,
} from '@/lib/types';
import { sharedAssetUrl } from '@/lib/domain';
import { IntegrationMissing, useIntegrationStatus } from './integration-status';
export function Studio({
  state,
  item,
  act,
  back,
  edit,
  library,
  reload,
  onDirtyChange,
}: {
  reload: () => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  state: State;
  item: Content;
  act: Action;
  back: () => void;
  edit: (c: Content) => void;
  library: (id: string) => void;
}) {
  const versions = state.versions
    .filter((v) => v.contentId === item.id)
    .sort((a, b) => b.number - a.number);
  const latest = versions[0];
  const [versionId, setVersionId] = useState(latest?.id);
  const current = versions.find((v) => v.id === versionId) || latest;
  const [draft, setDraft] = useState<Version>(current);
  const [tags, setTags] = useState(current?.hashtags.join(' ') || '');
  const [format, setFormat] = useState(
    item.format === 'Story' ? 'story' : 'feed',
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [comment, setComment] = useState('');
  const [compare, setCompare] = useState(false);
  const [remove, setRemove] = useState(false);
  const [approveReference, setApproveReference] = useState(true);
  const [changeModal, setChangeModal] = useState(false);
  const [confirmApproval, setConfirmApproval] = useState(false);
  const [recomposing, setRecomposing] = useState(false);
  const openai = useIntegrationStatus('/api/openai');
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState('');
  const brand = state.brands.find((b) => b.id === item.brandId)!;
  const hasUnsaved =
    !!draft &&
    !!current &&
    (['headline', 'copy', 'caption', 'feedUrl'].some(
      (k) => draft[k as keyof Version] !== current[k as keyof Version],
    ) ||
      tags !== current.hashtags.join(' '));
  // Lets the workspace warn before leaving the Studio with unsaved text.
  useEffect(() => {
    onDirtyChange?.(hasUnsaved);
    if (!hasUnsaved) return;
    const prevent = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [hasUnsaved, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
  if (!draft || !current)
    return <p>Esta pauta ainda não tem uma versão disponível.</p>;
  const historic = current.id !== latest?.id;
  const locked =
    !!current.locked ||
    ['APROVAÇÃO', 'APROVADO', 'PUBLICADO'].includes(item.status);
  const disabled = historic || locked || busy;
  // One entry per file: an approved-art record shares the URL of its source
  // file, so the picker keeps the first record of each URL.
  const images = state.assets.filter(
    (a, i, all) =>
      a.brandId === item.brandId &&
      a.mime.startsWith('image/') &&
      all.findIndex((o) => o.brandId === a.brandId && o.url === a.url) === i,
  );
  const context = buildBrandContext(
    brand,
    state.assets,
    state.contents.filter((c) => c.id !== item.id),
    item.brief,
  );
  const dirty = hasUnsaved;
  const run = async (action: string, data: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    try {
      await act(action, data);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const transition = async (status: Status) => {
    if (dirty) {
      setError('Salve uma nova versão antes de mudar o status.');
      return;
    }
    if (
      await run('status', {
        id: item.id,
        status,
        comment: feedback,
        addReference: approveReference,
      })
    ) {
      setChangeModal(false);
      setFeedback('');
    }
  };
  const sharedAsset = sharedAssetUrl(draft.feedUrl, draft.storyUrl);
  // Story 9:16 = AI recomposition of this same saved art (story-<source id>).
  const needsStory = item.format.includes('Story');
  const recomposedStory =
    current.storyUrl && current.storyUrl !== current.feedUrl
      ? current.storyUrl
      : '';
  const storyForDraft =
    recomposedStory && draft.feedUrl === current.feedUrl ? recomposedStory : '';
  const canvasSrc =
    format === 'story' && storyForDraft ? storyForDraft : sharedAsset;
  const recomposeStory = async () => {
    setRecomposing(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/openai/story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentId: item.id,
          requestId: crypto.randomUUID(),
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Falha ao recompor.');
      await reload();
      setFormat('story');
      setNotice(
        'Story recomposto em 9:16. Revise lado a lado com o Feed antes de aprovar.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRecomposing(false);
    }
  };
  return (
    <>
      <div className="studio-heading">
        <button className="text-btn" disabled={busy} onClick={back}>
          <ArrowLeft size={15} /> Conteúdos
        </button>
        <StatusBadge status={item.status} />
        <span className="muted">{brand.name} / Studio</span>
      </div>
      <div className="page-heading">
        <div>
          <h1 className="studio-title">{item.title}</h1>
          <p>
            {item.pillar} · {item.objective} · {item.date}
          </p>
        </div>
        <button
          className="outline-btn"
          disabled={locked || busy}
          onClick={() => edit(item)}
        >
          Editar pauta
        </button>
      </div>
      {error && (
        <p className="error notice" role="alert">
          {error}
        </p>
      )}
      <div className="studio-toolbar">
        <Tabs value={format} onValueChange={(v) => setFormat(String(v))}>
          <TabsList>
            <TabsTrigger disabled={!item.format.includes('Feed')} value="feed">
              Feed <small>4:5</small>
            </TabsTrigger>
            <TabsTrigger
              disabled={!item.format.includes('Story')}
              value="story"
            >
              Story <small>9:16</small>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="toolbar-inline">
          <Picker
            label="Versão"
            value={current.id}
            onChange={(id) => {
              if (busy) return;
              const v = versions.find((v) => v.id === id);
              if (v) {
                setVersionId(id);
                setDraft(v);
                setTags(v.hashtags.join(' '));
              }
            }}
            options={versions.map((v) => ({
              value: v.id,
              label: `V${v.number}${v.locked ? ' · aprovada' : ''}${v.id === latest.id ? ' · atual' : ''}`,
            }))}
          />
          <button
            className="outline-btn"
            disabled={versions.length < 2}
            onClick={() => setCompare(true)}
          >
            <GitCompareArrows size={16} /> Comparar
          </button>
        </div>
      </div>
      <div className="studio-layout">
        <section>
          <div className="art-workspace">
            <div className={'art-preview ' + format}>
              {sharedAsset ? (
                <ArtViewer
                  key={canvasSrc}
                  height={format === 'feed' ? 1350 : 1920}
                  src={canvasSrc}
                  alt={'Arte ' + format + ' · versão ' + current.number}
                />
              ) : (
                <div className="art-empty">
                  <ImagePlus size={36} strokeWidth={1} />
                  <strong>
                    {format === 'feed'
                      ? 'Sua criação começa aqui'
                      : 'Story: adaptação vertical da mesma criação'}
                  </strong>
                  <p>{format === 'feed' ? '1080 × 1350' : '1080 × 1920'}</p>
                  <span>
                    Selecione uma arte da biblioteca. Ela será aplicada aos
                    dois layouts da mesma criação.
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="art-controls">
            <Field label="Arte compartilhada do Post e Story">
              <Picker
                label="Selecionar arte"
                value={
                  sharedAsset || 'none'
                }
                onChange={(v) =>
                  !disabled &&
                  setDraft({
                    ...draft,
                    feedUrl: v === 'none' ? '' : v,
                    storyUrl: v === 'none' ? '' : v,
                  })
                }
                options={[
                  { value: 'none', label: 'Sem arte selecionada' },
                  ...images.map((a) => ({ value: a.url, label: a.name })),
                ]}
              />
            </Field>
            <button
              className="outline-btn"
              disabled={busy}
              onClick={() => {
                setNotice('');
                setUploading(true);
              }}
            >
              <ImagePlus size={15} /> Adicionar referência ou imagem
            </button>
            <button
              className="text-btn"
              onClick={() => library(item.brandId)}
            >
              Abrir Biblioteca
            </button>
          </div>
          {notice && (
            <p className="success" role="status">
              {notice}
            </p>
          )}
          <p className="form-hint">
            Feed e Story são a mesma criação: o Story é a recomposição em 9:16
            desta arte, preservando imagem, textos, identidade e conceito.
          </p>
          {needsStory && sharedAsset && (
            <section className="story-recompose" aria-live="polite">
              <h3>Story 9:16</h3>
              {storyForDraft ? (
                <>
                  <p className="form-hint">
                    Recomposto com IA a partir desta arte. Confira se foto,
                    textos, logotipo e elementos são os mesmos do Feed.
                  </p>
                  <div className="story-compare">
                    <figure>
                      <img src={sharedAsset} alt="Arte do Feed" />
                      <figcaption>Feed · 4:5</figcaption>
                    </figure>
                    <figure>
                      <img src={storyForDraft} alt="Story recomposto" />
                      <figcaption>Story · 9:16</figcaption>
                    </figure>
                  </div>
                </>
              ) : (
                <p className="notice">
                  Story ainda não recomposto: o formato vertical está mostrando
                  a arte do Feed.
                </p>
              )}
              {openai.configured === false && <IntegrationMissing name="OpenAI" />}
              {dirty && !disabled && (
                <p className="form-hint">
                  Salve uma nova versão com a arte antes de recompor o Story.
                </p>
              )}
              <button
                className="outline-btn"
                disabled={
                  disabled ||
                  dirty ||
                  recomposing ||
                  openai.checking ||
                  openai.configured === false
                }
                onClick={() => void recomposeStory()}
              >
                {recomposing
                  ? 'Recompondo o Story… (pode levar até 2 minutos)'
                  : storyForDraft
                    ? 'Recompor novamente'
                    : 'Recompor Story com IA'}
              </button>
              <p className="form-hint">
                Usa a API OpenAI e consome créditos a cada recomposição.
              </p>
            </section>
          )}
          {dirty && (
            <p className="notice">
              Salve as alterações dos textos antes de criar outro criativo.
            </p>
          )}
          <MagnificGenerator key={item.id} state={state} item={item} disabled={disabled || dirty} reload={reload}/>
          <ImageGenerator
            contentId={item.id}
            formats={item.format}
            disabled={disabled || dirty}
            onBusy={setBusy}
            reload={reload}
          />
          <section className="panel section-space">
            <h2>Contexto da marca</h2>
            <p className="muted">
              {brand.voice || 'Defina o tom de voz no Brand Space.'}
            </p>
            <div className="context-stats">
              <span>
                {context.references.filter((a) => a.approved).length} artes
                aprovadas
              </span>
              <span>
                {context.references.filter((a) => a.priority).length}{' '}
                referências prioritárias
              </span>
              <span>{context.history.length} conteúdos anteriores</span>
            </div>
            <p className="form-hint">
              {item.brief || 'Briefing ainda não preenchido.'}
            </p>
          </section>
        </section>
        <section className="studio-editor">
          {(locked || historic) && (
            <p className="notice">
              <Lock size={15} />
              {historic
                ? 'Você está consultando uma versão anterior.'
                : 'Versão protegida contra alterações.'}
            </p>
          )}
          <Field label="Headline">
            <Input
              disabled={disabled}
              value={draft.headline}
              onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
            />
          </Field>
          <Field label="Texto complementar da arte">
            <Textarea
              disabled={disabled}
              value={draft.copy}
              onChange={(e) => setDraft({ ...draft, copy: e.target.value })}
            />
          </Field>
          <Field label="Legenda">
            <Textarea
              rows={6}
              disabled={disabled}
              value={draft.caption}
              onChange={(e) => setDraft({ ...draft, caption: e.target.value })}
            />
          </Field>
          <Field label="Exatamente 5 hashtags">
            <Textarea
              disabled={disabled}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="#Marca #Tema #Conteúdo #Inspiração #Conexão"
            />
          </Field>
          <div className="editor-meta">
            <span>
              {tags.trim() ? tags.trim().split(/\s+/).length : 0} / 5 hashtags
            </span>
            <span>
              V{current.number} ·{' '}
              {new Date(current.createdAt).toLocaleDateString('pt-BR')}
            </span>
          </div>
          <button
            disabled={disabled}
            className="outline-btn full section-space"
            onClick={() =>
              void run('saveVersion', {
                ...draft,
                id: item.id,
                hashtags: tags.trim().split(/\s+/),
                change: 'Textos e composição revisados no Studio',
              })
            }
          >
            <Save size={16} />
            {busy
              ? 'Salvando…'
              : `Salvar nova versão · V${(latest?.number || 0) + 1}`}
          </button>
          <div className="workflow-actions">
            {!historic &&
              (['IDEIA', 'PLANEJADO'].includes(item.status) ? (
                <button
                  className="create-btn full"
                  disabled={busy}
                  onClick={() => void transition('EM CRIAÇÃO')}
                >
                  Iniciar criação <ArrowUpRight size={16} />
                </button>
              ) : item.status === 'EM CRIAÇÃO' ||
                item.status === 'ALTERAÇÃO' ? (
                <button
                  className="create-btn full"
                  disabled={busy}
                  onClick={() => void transition('REVISÃO')}
                >
                  Levar para revisão <ArrowUpRight size={16} />
                </button>
              ) : item.status === 'REVISÃO' ? (
                <button
                  className="create-btn full"
                  disabled={busy}
                  onClick={() => void transition('APROVAÇÃO')}
                >
                  <Send size={16} /> Enviar para aprovação
                </button>
              ) : item.status === 'APROVAÇÃO' ? (
                <>
                  <label htmlFor="approve-reference" className="check-label">
                    <Checkbox
                      id="approve-reference"
                      checked={approveReference}
                      onCheckedChange={(v) => setApproveReference(!!v)}
                    />{' '}
                    Adicionar artes às referências da marca
                  </label>
                  <button
                    className="create-btn full"
                    disabled={busy}
                    onClick={() => {
                      if (dirty) {
                        setError('Salve uma nova versão antes de mudar o status.');
                        return;
                      }
                      setConfirmApproval(true);
                    }}
                  >
                    <Check size={16} /> Aprovar versão
                  </button>
                  <button
                    className="outline-btn full"
                    disabled={busy}
                    onClick={() => setChangeModal(true)}
                  >
                    Solicitar alteração
                  </button>
                </>
              ) : item.status === 'APROVADO' ? (
                <button
                  className="create-btn full"
                  disabled={busy}
                  onClick={() => void transition('PUBLICADO')}
                >
                  <Check size={16} /> Marcar como publicado
                </button>
              ) : (
                <p className="success">
                  <Check size={15} /> Conteúdo publicado
                </p>
              ))}
          </div>
          <section className="comments">
            <h2>
              <MessageSquare size={16} /> Conversa da peça
            </h2>
            {state.comments
              .filter((c) => c.contentId === item.id)
              .map((c) => (
                <article key={c.id}>
                  <strong>{c.user}</strong>
                  <p>{c.text}</p>
                  <small>
                    {new Date(c.createdAt).toLocaleDateString('pt-BR')}
                  </small>
                </article>
              ))}
            <Field label="Adicionar comentário">
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Compartilhe uma direção ou observação."
              />
            </Field>
            <button
              className="outline-btn"
              disabled={busy || !comment.trim()}
              onClick={async () => {
                if (await run('comment', { id: item.id, text: comment }))
                  setComment('');
              }}
            >
              Comentar
            </button>
          </section>
          {!busy && (
            <button
              className="text-btn danger section-space"
              onClick={() => setRemove(true)}
            >
              <Trash2 size={14} /> Mover para lixeira
            </button>
          )}
        </section>
      </div>
      {compare && (
        <FormModal
          title="Comparar versões"
          description="O histórico é preservado a cada nova versão."
          open
          onClose={() => setCompare(false)}
        >
          <div className="comparison">
            {[current, versions.find((v) => v.id !== current.id)!].map((v) => (
              <section key={v.id}>
                <h2>
                  V{v.number} {!!v.locked && '· Aprovada'}
                </h2>
                <h3>{v.headline}</h3>
                <p>{v.copy}</p>
                <p>{v.caption}</p>
                <p className="muted">{v.hashtags.join(' ')}</p>
                {v.feedUrl && (
                  <Image
                    unoptimized
                    width={1080}
                    height={1350}
                    src={v.feedUrl}
                    alt={'Feed V' + v.number}
                  />
                )}
                <small>{v.change} · Agência criativa</small>
              </section>
            ))}
          </div>
        </FormModal>
      )}
      {changeModal && (
        <FormModal
          title="Solicitar alteração"
          description="Dê uma orientação clara para a próxima versão."
          open
          onClose={() => setChangeModal(false)}
        >
          <Field label="O que precisa mudar?">
            <Textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
            />
          </Field>
          <button
            className="create-btn"
            disabled={busy || !feedback.trim()}
            onClick={() => void transition('ALTERAÇÃO')}
          >
            Enviar solicitação
          </button>
        </FormModal>
      )}
      {uploading && (
        <AssetEditor
          state={state}
          initialCategory="visual_reference"
          brandId={item.brandId}
          fixedBrand
          act={act}
          close={() => setUploading(false)}
          saved={async () => {
            await reload();
            setUploading(false);
            setNotice(
              'Arquivo adicionado à Biblioteca da marca. Selecione-o em “Arte compartilhada do Post e Story”.',
            );
          }}
        />
      )}
      <AlertDialog open={confirmApproval} onOpenChange={setConfirmApproval}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar a versão V{current.number}?</AlertDialogTitle>
            <AlertDialogDescription>
              A versão ficará protegida contra edições e pronta para publicação.
              Para mudar algo depois, será preciso criar uma nova pauta.
              {approveReference &&
                ' A arte será adicionada às Artes aprovadas da marca; o arquivo original continua na categoria em que foi enviado.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setConfirmApproval(false);
                await transition('APROVADO');
              }}
            >
              Aprovar versão
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={remove} onOpenChange={setRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mover esta pauta para a lixeira?
            </AlertDialogTitle>
            <AlertDialogDescription>
              A pauta sairá das listas. Suas versões serão preservadas e você
              poderá restaurá-la na lixeira de Conteúdos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (await run('deleteContent', { id: item.id })) back();
              }}
            >
              Mover para lixeira
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
