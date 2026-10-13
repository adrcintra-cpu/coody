import { env } from 'cloudflare:workers';
import { validatePlanning } from '@/lib/ai-planning';
import { authorize, registerUser } from '@/lib/auth';
import { parseBrand, guidelineRules } from '@/lib/brand-validation';
import { assetCategories, canonicalCategory } from '@/lib/brand-memory';
import { database, insert, readState, saveGuidelines } from '@/lib/repository';
import {
  validateDate,
  validateHashtags,
  assertTransition,
  planProposal,
  dateAvailableToBrand,
  validateMonth,
  validateSharedCreation,
  assertChangesAddressed,
  approvedArtRecord,
  storyAdaptationUrl,
} from '@/lib/domain';
import { isInactive } from '@/lib/brand-lifecycle';
import { actionPermission, can, deniedMessage } from '@/lib/permissions';
import { validateAttachments } from '@/lib/creative-materials';
import { formats, type Brand, type Content, type Status, type Plan, type MediaItem } from '@/lib/types';
export async function GET(request: Request) {
  const user = await authorize(request);
  if (user instanceof Response) return user;
  try {
    const profile = await database()
      .prepare('SELECT avatarUrl FROM users WHERE id=?')
      .bind(user.id)
      .first<{ avatarUrl: string }>();
    return Response.json(
      {
        ...(await readState(request)),
        user: { ...user, avatarUrl: profile?.avatarUrl || '' },
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    console.error('workspace', error);
    return Response.json(
      { error: 'Não foi possível carregar o workspace.' },
      { status: 503 },
    );
  }
}
const str = (v: unknown, max = 6000) =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';
const id = () => crypto.randomUUID();
const conflictMessage =
  'Esta pauta mudou em outra aba. Atualize os dados e revise antes de tentar novamente.';
class ConflictError extends Error {}
export async function POST(request: Request) {
  const user = await authorize(request);
  if (user instanceof Response) return user;
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  try {
    const { action, data } = (await request.json()) as {
      action: string;
      data: Record<string, unknown>;
    };
    if (!data || typeof data !== 'object') throw new Error('Dados inválidos.');
    await registerUser(user);
    const db = database();
    const state = await readState(request);
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];
    const entityId = str(data.id) || id();
    const brand = state.brands.find((b) => b.id === data.brandId);
    const item = state.contents.find((c) => c.id === data.id);
    if (
      item &&
      [
        'editContent',
        'saveVersion',
        'status',
        'deleteContent',
        'setAttachments',
      ].includes(action) &&
      data.expectedRevision !== undefined &&
      data.expectedRevision !== (item.revision ?? 0)
    )
      throw new ConflictError(conflictMessage);
    // Role: approvers comment and decide; editors create; admins manage.
    {
      const permission = actionPermission(action, data, item?.status);
      if (!can(user.role, permission)) throw new Error(deniedMessage(permission));
    }
    // An inactive brand keeps its data but takes part in no creation flow
    // until it is reactivated.
    const owner = brand || state.brands.find((b) => b.id === item?.brandId);
    if (
      owner &&
      isInactive(owner) &&
      ![
        'saveBrand',
        'setBrandStatus',
        'deleteBrand',
        'restoreBrand',
      ].includes(action)
    )
      throw new Error(
        'A marca ' + owner.name + ' está inativa. Reative-a em Marcas para continuar.',
      );
    if (action === 'setBrandStatus') {
      const target = state.brands.find((b) => b.id === data.id);
      if (!target) throw new Error('Marca não encontrada neste workspace.');
      const status = data.status;
      if (status !== 'active' && status !== 'inactive')
        throw new Error('Status de marca inválido.');
      statements.push(
        db
          .prepare('UPDATE brands SET status=? WHERE id=? AND deletedAt IS NULL')
          .bind(status, target.id),
      );
    } else if (action === 'deleteBrand') {
      const target = state.brands.find((b) => b.id === data.id);
      if (!target) throw new Error('Marca não encontrada neste workspace.');
      if (str(data.confirmName, 200) !== target.name.trim())
        throw new Error('Digite o nome da marca exatamente como aparece para confirmar.');
      // Soft delete: the brand and everything linked to it leave every
      // screen and stay restorable until the purge.
      statements.push(
        db
          .prepare('UPDATE brands SET deletedAt=? WHERE id=? AND deletedAt IS NULL')
          .bind(now, target.id),
      );
    } else if (action === 'restoreBrand') {
      const target = state.deletedBrands?.find((b) => b.id === data.id);
      if (!target) throw new Error('Marca não encontrada na lixeira.');
      statements.push(
        db
          .prepare(
            'UPDATE brands SET deletedAt=NULL WHERE id=? AND workspaceId=? AND deletedAt IS NOT NULL',
          )
          .bind(target.id, state.workspace!.id),
      );
    } else if (action === 'saveBrand') {
      const existing = state.brands.find((b) => b.id === data.id);
      const row = parseBrand(data, existing?.id || entityId, existing);
      if (existing) {
        const keys = Object.keys(row).filter(
          (k) => k !== 'id',
        ) as (keyof Brand)[];
        statements.push(
          db
            .prepare(
              `UPDATE brands SET ${keys.map((k) => k + ' = ?').join(',')} WHERE id = ?`,
            )
            .bind(
              ...keys.map((k) =>
                typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k],
              ),
              row.id,
            ),
        );
      } else statements.push(insert('brands', {...row,workspaceId:state.workspace!.id}));
      statements.push(...saveGuidelines(row.id, guidelineRules(row), now));
    } else if (action === 'createContent' || action === 'editContent') {
      if (!brand) throw new Error('Selecione uma marca válida.');
      const title = str(data.title, 200);
      if (!title) throw new Error('Informe o tema do conteúdo.');
      const date = str(data.date);
      validateDate(date);
      const format = str(data.format);
      if (!(formats as readonly string[]).includes(format))
        throw new Error('Selecione um formato válido.');
      if (!brand.pillars.some((p) => p.name === data.pillar))
        throw new Error('Selecione um pilar válido.');
      // Product photos chosen for this piece; omitted on edit keeps them.
      const attachments =
        data.attachments === undefined
          ? undefined
          : validateAttachments(data.attachments, brand.id, state.assets);
      if (action === 'editContent') {
        if (!item) throw new Error('Conteúdo não encontrado.');
        if (item.brandId !== brand.id)
          throw new Error('A pauta pertence a outra marca.');
        if (['APROVADO', 'PUBLICADO', 'APROVAÇÃO'].includes(item.status))
          throw new Error(
            'Esta versão está protegida. Solicite uma alteração antes de editar.',
          );
        statements.push(
          db
            .prepare(
              'UPDATE content_items SET title=?, brief=?, objective=?, pillar=?, date=?, format=?, attachments=? WHERE id=?',
            )
            .bind(
              title,
              str(data.brief),
              str(data.objective),
              str(data.pillar),
              date,
              format,
              JSON.stringify(attachments ?? item.attachments ?? []),
              item.id,
            ),
        );
      } else {
        const content: Content = {
          id: entityId,
          brandId: brand.id,
          title,
          brief: str(data.brief),
          objective: str(data.objective),
          pillar: str(data.pillar),
          date,
          format,
          status: 'IDEIA',
          createdAt: now,
          attachments: attachments ?? [],
        };
        statements.push(insert('content_items', content));
        statements.push(
          insert('content_versions', {
            id: id(),
            contentId: entityId,
            number: 1,
            headline: title,
            copy: '',
            caption: '',
            hashtags: [],
            feedUrl: '',
            storyUrl: '',
            change: 'Briefing inicial',
            createdAt: now,
            locked: 0,
          }),
        );
      }
    } else if (action === 'saveVersion') {
      if (!item) throw new Error('Conteúdo não encontrado.');
      if (['APROVADO', 'PUBLICADO', 'APROVAÇÃO'].includes(item.status))
        throw new Error('Conteúdo protegido contra edição.');
      const tags = data.hashtags as string[];
      validateHashtags(tags);
      const versions = state.versions.filter((v) => v.contentId === item.id);
      const number = Math.max(0, ...versions.map((v) => v.number)) + 1;
      const headline = str(data.headline, 300),
        caption = str(data.caption);
      if (!headline || !caption)
        throw new Error('Preencha headline e legenda.');
      const image = (v: unknown) => {
        const value = str(v, 1000);
        if (
          value &&
          !state.assets.some(
            (a) =>
              a.brandId === item.brandId &&
              a.url === value &&
              a.mime.startsWith('image/'),
          )
        )
          throw new Error('Escolha uma imagem da biblioteca desta marca.');
        return value;
      };
      // One source art per piece; both canvases store it. A Story URL sent by
      // the client is only accepted when it is that source (or its derived
      // story-<id> file), never an independent image.
      const source = str(data.feedUrl, 1000);
      const story = str(data.storyUrl, 1000);
      const sharedAsset = image(
        source ||
          (story && !story.startsWith('/api/assets/story-') ? story : ''),
      );
      if (
        story &&
        sharedAsset &&
        story !== sharedAsset &&
        story !== storyAdaptationUrl(sharedAsset)
      )
        throw new Error('Feed e Story devem usar a mesma criação visual.');
      statements.push(
        insert('content_versions', {
          id: id(),
          contentId: item.id,
          number,
          headline,
          copy: str(data.copy),
          caption,
          hashtags: tags,
          feedUrl: sharedAsset,
          storyUrl: sharedAsset,
          change: str(data.change) || 'Revisão criativa',
          createdAt: now,
          locked: 0,
        }),
      );
    } else if (action === 'status') {
      if (!item) throw new Error('Conteúdo não encontrado.');
      const target = data.status as Status;
      assertTransition(item.status, target);
      const version = state.versions
        .filter((v) => v.contentId === item.id)
        .sort((a, b) => b.number - a.number)[0];
      let sharedAsset = '';
      // Pieces sent as files (video, carousel, external): only need the files.
      if (['APROVAÇÃO', 'APROVADO'].includes(target) && version?.media?.length) {
        sharedAsset = version.media.find((m) => m.mime.startsWith('image/'))?.url || '';
      } else if (['APROVAÇÃO', 'APROVADO'].includes(target)) {
        if (!version?.headline || !version.caption)
          throw new Error('Complete headline e legenda no Studio.');
        validateHashtags(version.hashtags);
        sharedAsset = validateSharedCreation(item.format, version.feedUrl, version.storyUrl);
        if (!sharedAsset)
          throw new Error(
            'Anexe as artes dos formatos selecionados antes da aprovação.',
          );
        // With OpenAI configured, the Story must be the 9:16 recomposition
        // of this same art, not the Feed file shown in the vertical canvas.
        if (
          item.format.includes('Story') &&
          (env as unknown as Record<string, string>).OPENAI_API_KEY &&
          version.storyUrl === version.feedUrl
        )
          throw new Error(
            'Recomponha o Story 9:16 com IA no Studio e revise-o ao lado do Feed antes da aprovação.',
          );
      }
      if (target === 'ALTERAÇÃO' && !str(data.comment))
        throw new Error('Descreva a alteração solicitada.');
      if (target === 'AJUSTE' && !str(data.comment))
        throw new Error('Descreva o ajuste solicitado.');
      if (['REVISÃO', 'APROVAÇÃO'].includes(target)) {
        const changeRequest = await db
          .prepare(
            "SELECT versionId FROM approvals WHERE contentId=? AND decision IN ('ALTERAÇÃO','AJUSTE') ORDER BY createdAt DESC LIMIT 1",
          )
          .bind(item.id)
          .first<{ versionId: string }>();
        assertChangesAddressed(target, version?.id, changeRequest?.versionId);
      }
      statements.push(
        db
          .prepare('UPDATE content_items SET status=? WHERE id=? AND status=?')
          .bind(target, item.id, item.status),
      );
      if (target === 'APROVADO') {
        statements.push(
          db
            .prepare('UPDATE content_versions SET locked=1 WHERE id=?')
            .bind(version.id),
        );
        if (data.addReference) {
          // Registers the approved art as a new library record. The source
          // file keeps its category (e.g. a product photo stays in Produtos).
          const approvedArt = approvedArtRecord(state.assets, {
            brandId: item.brandId,
            url: sharedAsset,
            title: item.title,
            versionNumber: version.number,
            id: id(),
            now,
          });
          if (approvedArt) statements.push(insert('brand_assets', approvedArt));
        }
      }
      if (['APROVAÇÃO', 'APROVADO', 'ALTERAÇÃO', 'AJUSTE'].includes(target))
        statements.push(
          insert('approvals', {
            id: id(),
            contentId: item.id,
            versionId: version.id,
            decision: target,
            createdAt: now,
            userId: user.id,
          }),
        );
      if (str(data.comment))
        statements.push(
          insert('comments', {
            id: id(),
            contentId: item.id,
            text: str(data.comment),
            createdAt: now,
            user: user.name,
          }),
        );
    } else if (action === 'comment') {
      if (!item || !str(data.text)) throw new Error('Escreva um comentário.');
      statements.push(
        insert('comments', {
          id: id(),
          contentId: item.id,
          text: str(data.text),
          createdAt: now,
          user: user.name,
        }),
      );
    } else if (action === 'savePlan' || action === 'updatePlan' || action === 'savePlanConfig') {
      if (!brand) throw new Error('Selecione uma marca.');
      const plan: Plan = {
        id: entityId,
        brandId: brand.id,
        month: str(data.month),
        monthlyGoal: Number(data.monthlyGoal),
        weeklyGoal: Number(data.weeklyGoal),
        days: data.days as number[],
        campaign: str(data.campaign),
        selectedDates: data.selectedDates as string[],
      };
      if (
        !Number.isInteger(plan.weeklyGoal) ||
        plan.weeklyGoal < 1 ||
        plan.weeklyGoal > 30 ||
        !Array.isArray(plan.selectedDates)
      )
        throw new Error('Revise as configurações.');
      if (
        plan.selectedDates.some(
          (id) =>
            !state.dates.some(
              (d) =>
                d.id === id &&
                dateAvailableToBrand(d, brand.id) &&
                d.date.startsWith(plan.month),
            ),
        )
      )
        throw new Error('Selecione apenas datas desta marca e mês.');
      validateMonth(plan.month);
      if (
        !Number.isInteger(plan.monthlyGoal) ||
        plan.monthlyGoal < 1 ||
        plan.monthlyGoal > 100 ||
        !Array.isArray(plan.days) ||
        !plan.days.length ||
        plan.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
      )
        throw new Error('Revise as metas e os dias de publicação.');
      const existing = state.plans.find(
        (p) => p.brandId === brand.id && p.month === plan.month,
      );
      if (action === 'updatePlan') {
        if (!existing || existing.id !== data.id)
          throw new Error('Planejamento não encontrado nesta marca.');
        statements.push(
          db
            .prepare(
              'UPDATE monthly_plans SET monthlyGoal=?,weeklyGoal=?,days=?,campaign=?,selectedDates=? WHERE id=? AND brandId=?',
            )
            .bind(
              plan.monthlyGoal,
              plan.weeklyGoal,
              JSON.stringify(plan.days),
              plan.campaign,
              JSON.stringify(plan.selectedDates),
              existing.id,
              brand.id,
            ),
        );
      } else if (action === 'savePlanConfig') {
        if (existing)
          throw new Error('Este mês já possui planejamento. Use Salvar revisão.');
        statements.push(insert('monthly_plans', { ...plan, approval: 'rascunho' }));
      } else {
        const slots = planProposal(
          brand,
          plan,
          state.dates,
          state.contents.filter((c) => c.brandId === brand.id),
        );
        const proposal = data.proposal === undefined ? slots : validatePlanning(data.proposal,slots,state.contents.filter(c=>c.brandId===brand.id));
        if (existing)
          throw new Error(
            'Este mês já foi planejado. Edite as pautas existentes ou crie novas pautas.',
          );
        statements.push(insert('monthly_plans', { ...plan, approval: 'rascunho' }));
        for (const p of proposal) {
          const contentId = id();
          statements.push(
            insert('content_items', { ...p, id: contentId, createdAt: now }),
          );
          statements.push(
            insert('content_versions', {
              id: id(),
              contentId,
              number: 1,
              headline: p.title,
              copy: '',
              caption: '',
              hashtags: [],
              feedUrl: '',
              storyUrl: '',
              change: data.proposal ? 'Pauta do planejamento com IA' : 'Pauta do planejamento',
              createdAt: now,
              locked: 0,
            }),
          );
        }
      }
    } else if (action === 'planApproval') {
      // The month plan: sent to the client, back to draft, or marked as
      // approved by the team (when the client approved outside the link).
      const plan = state.plans.find((p) => p.id === data.id);
      if (!plan || !state.brands.some((b) => b.id === plan.brandId))
        throw new Error('Planejamento não encontrado.');
      const status = data.status;
      if (status !== 'enviado' && status !== 'rascunho' && status !== 'aprovado')
        throw new Error('Situação inválida.');
      if (
        status === 'enviado' &&
        !state.contents.some((c) => c.brandId === plan.brandId && c.date.startsWith(plan.month))
      )
        throw new Error('Inclua ao menos uma pauta antes de enviar o planejamento.');
      statements.push(
        status === 'aprovado'
          ? db
              .prepare('UPDATE monthly_plans SET approval=?,approvedAt=?,approvedBy=? WHERE id=?')
              .bind(status, now, (user.name || user.email) + ' (pela equipe)', plan.id)
          : db
              .prepare(
                "UPDATE monthly_plans SET approval=?,approvedAt=NULL,approvedBy='',approvalNote=CASE WHEN ?='enviado' THEN approvalNote ELSE '' END WHERE id=?",
              )
              .bind(status, status, plan.id),
      );
    } else if (action === 'createExternal' || action === 'mediaVersion') {
      // A post, carousel, video or file made outside the COODY, sent for
      // approval. createExternal makes the piece already in approval;
      // mediaVersion adds a new version with new files (after a request).
      const target =
        action === 'createExternal' ? brand : state.brands.find((b) => b.id === item?.brandId);
      if (!target) throw new Error('Selecione uma marca válida.');
      if (action === 'mediaVersion' && !item) throw new Error('Conteúdo não encontrado.');
      if (action === 'mediaVersion' && ['APROVADO', 'PUBLICADO'].includes(item!.status))
        throw new Error('Esta peça já foi aprovada.');
      const ids = Array.isArray(data.media) ? data.media.filter((x): x is string => typeof x === 'string') : [];
      if (!ids.length || ids.length > 20) throw new Error('Envie de 1 a 20 arquivos.');
      const media: MediaItem[] = ids.map((id) => {
        const a = state.assets.find((x) => x.id === id && x.brandId === target.id);
        if (!a) throw new Error('Arquivo não encontrado nesta marca.');
        return { url: a.url, mime: a.mime, name: a.name };
      });
      const firstImage = media.find((m) => m.mime.startsWith('image/'))?.url || '';
      const contentId = action === 'createExternal' ? entityId : item!.id;
      if (action === 'createExternal') {
        const title = str(data.title, 200);
        if (!title) throw new Error('Informe o título da peça.');
        const date = str(data.date);
        validateDate(date);
        const format = str(data.format) || (media.length > 1 ? 'Carrossel' : media[0].mime.startsWith('video/') ? 'Vídeo' : media[0].mime.startsWith('image/') ? 'Feed' : 'Arquivo');
        if (!(formats as readonly string[]).includes(format)) throw new Error('Selecione um formato válido.');
        statements.push(
          insert('content_items', {
            id: contentId,
            brandId: target.id,
            title,
            brief: str(data.brief),
            objective: 'Aprovação de peça',
            pillar: target.pillars[0]?.name || 'Institucional',
            date,
            format,
            status: 'APROVAÇÃO',
            createdAt: now,
            attachments: [],
          }),
        );
      }
      const versions = state.versions.filter((v) => v.contentId === contentId);
      const last = versions.sort((a, b) => b.number - a.number)[0];
      statements.push(
        insert('content_versions', {
          id: id(),
          contentId,
          number: (last?.number || 0) + 1,
          headline: last?.headline || str(data.title, 300) || 'Peça enviada',
          copy: last?.copy || '',
          caption: str(data.caption) || last?.caption || '',
          hashtags: last?.hashtags || [],
          feedUrl: firstImage,
          storyUrl: firstImage,
          change: str(data.change) || (action === 'createExternal' ? 'Peça enviada para aprovação' : 'Nova versão enviada'),
          createdAt: now,
          locked: 0,
          media,
        }),
      );
    } else if (action === 'setAttachments') {
      if (!item) throw new Error('Conteúdo não encontrado.');
      if (['APROVADO', 'PUBLICADO', 'APROVAÇÃO'].includes(item.status))
        throw new Error(
          'Esta pauta está protegida. Solicite alteração antes de trocar os anexos.',
        );
      statements.push(
        db
          .prepare('UPDATE content_items SET attachments=? WHERE id=?')
          .bind(
            JSON.stringify(
              validateAttachments(data.attachments, item.brandId, state.assets),
            ),
            item.id,
          ),
      );
    } else if (action === 'deleteContent') {
      if (!item) throw new Error('Conteúdo não encontrado.');
      statements.push(
        db
          .prepare('UPDATE content_items SET deletedAt=? WHERE id=?')
          .bind(now, item.id),
      );
    } else if (action === 'assetFlags' || action === 'saveAsset') {
      const asset = state.assets.find(
        (a) => a.id === data.id && a.brandId === data.brandId,
      );
      if (!asset) throw new Error('Arquivo não encontrado nesta marca.');
      const category =
        action === 'saveAsset'
          ? str(data.category)
          : data.approved
            ? 'approved_art'
            : asset.category === 'approved_art'
              ? 'visual_reference'
              : canonicalCategory(asset.category);
      if (!assetCategories.some((c) => c.value === category))
        throw new Error('Categoria inválida.');
      const name = action === 'saveAsset' ? str(data.name, 200) : asset.name;
      if (!name) throw new Error('Informe o nome do arquivo.');
      statements.push(
        db
          .prepare(
            'UPDATE brand_assets SET name=?,category=?,description=?,aiNotes=?,priority=?,approved=?,updatedAt=? WHERE id=? AND brandId=?',
          )
          .bind(
            name,
            category,
            action === 'saveAsset' ? str(data.description) : asset.description,
            action === 'saveAsset' ? str(data.aiNotes) : asset.aiNotes,
            data.priority ? 1 : 0,
            category === 'approved_art' ? 1 : 0,
            now,
            asset.id,
            asset.brandId,
          ),
      );
    } else if (action === 'assignDate') {
      if (!brand) throw new Error('Selecione uma marca válida.');
      const date = state.dates.find(
        (d) => d.id === data.id && !d.brandId && !d.isGlobal,
      );
      if (!date) throw new Error('Data não disponível para vinculação.');
      statements.push(
        db
          .prepare(
            'UPDATE special_dates SET brandId=? WHERE id=? AND brandId IS NULL AND isGlobal=0',
          )
          .bind(brand.id, date.id),
      );
    } else if (action === 'createDate') {
      if (!brand) throw new Error('Selecione a marca da data.');
      const name = str(data.name, 150),
        date = str(data.date);
      if (!name) throw new Error('Informe o nome da data.');
      validateDate(date);
      statements.push(
        insert('special_dates', {
          id: entityId,
          brandId: brand.id,
          isGlobal: 0,
          name,
          date,
          segments: str(data.segments) || 'Institucional',
          relevance: 'Alta',
        }),
      );
    } else throw new Error('Ação não disponível.');
    if (
      item &&
      [
        'editContent',
        'saveVersion',
        'status',
        'deleteContent',
        'setAttachments',
      ].includes(action)
    ) {
      const expected = data.expectedRevision ?? item.revision ?? 0;
      if (expected !== (item.revision ?? 0))
        throw new ConflictError(conflictMessage);
      // A failed compare must abort the entire D1 batch, including its side effects.
      statements.unshift(
        db
          .prepare(
            'UPDATE content_items SET revision=CASE WHEN revision=? THEN revision+1 ELSE NULL END WHERE id=?',
          )
          .bind(expected as number, item.id),
      );
    }
    statements.push(
      insert('activity_logs', {
        id: id(),
        userId: user.id,
        action,
        entityId,
        createdAt: now,
      }),
    );
    await db.batch(statements);
    return Response.json({ ok: true, id: entityId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Não foi possível salvar.';
    console.error('workspace action', error);
    const conflict =
      error instanceof ConflictError ||
      message.includes('content_items.revision');
    return Response.json(
      {
        error: conflict
          ? conflictMessage
          : message.includes('SQLITE')
            ? 'Os dados mudaram durante a edição. Atualize e tente novamente.'
            : message,
      },
      { status: conflict ? 409 : 400 },
    );
  }
}
