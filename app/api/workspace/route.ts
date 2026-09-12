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
} from '@/lib/domain';
import type { Brand, Content, Status, Plan } from '@/lib/types';
export async function GET() {
  try {
    return Response.json(await readState(), {
      headers: { 'Cache-Control': 'no-store' },
    });
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
    const db = database();
    const state = await readState();
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [];
    const entityId = str(data.id) || id();
    const brand = state.brands.find((b) => b.id === data.brandId);
    const item = state.contents.find((c) => c.id === data.id);
    if (
      item &&
      ['editContent', 'saveVersion', 'status', 'deleteContent'].includes(
        action,
      ) &&
      data.expectedRevision !== undefined &&
      data.expectedRevision !== (item.revision ?? 0)
    )
      throw new ConflictError(conflictMessage);
    if (action === 'saveBrand') {
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
      } else statements.push(insert('brands', row));
      statements.push(...saveGuidelines(row.id, guidelineRules(row), now));
    } else if (action === 'createContent' || action === 'editContent') {
      if (!brand) throw new Error('Selecione uma marca válida.');
      const title = str(data.title, 200);
      if (!title) throw new Error('Informe o tema do conteúdo.');
      const date = str(data.date);
      validateDate(date);
      const format = str(data.format);
      if (!['Feed', 'Story', 'Feed + Story'].includes(format))
        throw new Error('Selecione um formato válido.');
      if (!brand.pillars.some((p) => p.name === data.pillar))
        throw new Error('Selecione um pilar válido.');
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
              'UPDATE content_items SET title=?, brief=?, objective=?, pillar=?, date=?, format=? WHERE id=?',
            )
            .bind(
              title,
              str(data.brief),
              str(data.objective),
              str(data.pillar),
              date,
              format,
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
      statements.push(
        insert('content_versions', {
          id: id(),
          contentId: item.id,
          number,
          headline,
          copy: str(data.copy),
          caption,
          hashtags: tags,
          feedUrl: image(data.feedUrl),
          storyUrl: image(data.storyUrl),
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
      if (['APROVAÇÃO', 'APROVADO'].includes(target)) {
        if (!version?.headline || !version.caption)
          throw new Error('Complete headline e legenda no Studio.');
        validateHashtags(version.hashtags);
        if (
          (item.format.includes('Feed') && !version.feedUrl) ||
          (item.format.includes('Story') && !version.storyUrl)
        )
          throw new Error(
            'Anexe as artes dos formatos selecionados antes da aprovação.',
          );
      }
      if (target === 'ALTERAÇÃO' && !str(data.comment))
        throw new Error('Descreva a alteração solicitada.');
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
          for (const url of [version.feedUrl, version.storyUrl].filter(Boolean))
            statements.push(
              db
                .prepare(
                  "UPDATE brand_assets SET approved=1, priority=1, category='approved_art', updatedAt=? WHERE brandId=? AND url=?",
                )
                .bind(now, item.brandId, url),
            );
        }
      }
      if (['APROVAÇÃO', 'APROVADO', 'ALTERAÇÃO'].includes(target))
        statements.push(
          insert('approvals', {
            id: id(),
            contentId: item.id,
            versionId: version.id,
            decision: target,
            createdAt: now,
            userId: 'demo-admin',
          }),
        );
      if (str(data.comment))
        statements.push(
          insert('comments', {
            id: id(),
            contentId: item.id,
            text: str(data.comment),
            createdAt: now,
            user: 'Agência criativa',
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
          user: 'Agência criativa',
        }),
      );
    } else if (action === 'savePlan' || action === 'updatePlan') {
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
      } else {
        const proposal = planProposal(
          brand,
          plan,
          state.dates,
          state.contents.filter((c) => c.brandId === brand.id),
        );
        if (existing)
          throw new Error(
            'Este mês já foi planejado. Edite as pautas existentes ou crie novas pautas.',
          );
        statements.push(insert('monthly_plans', plan));
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
              change: 'Pauta do planejamento',
              createdAt: now,
              locked: 0,
            }),
          );
        }
      }
    } else if (action === 'deleteContent') {
      if (!item || !['IDEIA', 'PLANEJADO'].includes(item.status))
        throw new Error(
          'Somente ideias e pautas planejadas podem ser excluídas.',
        );
      statements.push(
        db.prepare('DELETE FROM content_items WHERE id=?').bind(item.id),
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
      ['editContent', 'saveVersion', 'status', 'deleteContent'].includes(action)
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
        userId: 'demo-admin',
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
