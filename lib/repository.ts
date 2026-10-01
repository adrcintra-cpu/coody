import { activeWorkspace } from './workspaces';
import { env } from 'cloudflare:workers';
import { canonicalCategory } from './brand-memory';
import { isStoryAdaptation, storyAdaptationUrl } from './domain';
import { isRecomposedStory } from './story-recompose';
import { purgeCutoff } from './brand-lifecycle';
import type {
  State,
  Brand,
  Content,
  Version,
  Asset,
  Plan,
  Comment,
  SpecialDate,
  DeletedBrand,
} from './types';
export function database() {
  if (!env.DB) throw new Error('Banco de dados indisponível.');
  return env.DB as D1Database;
}
export function bucket() {
  if (!env.FILES) throw new Error('Armazenamento indisponível.');
  return env.FILES as R2Bucket;
}
const allowed = new Set([
  'users',
  'brands',
  'brand_guidelines',
  'content_items',
  'content_versions',
  'brand_assets',
  'comments',
  'special_dates',
  'monthly_plans',
  'activity_logs',
  'approvals',
]);
export function insert(
  table: string,
  row: Record<string, unknown>,
  ignore = false,
) {
  if (!allowed.has(table)) throw new Error('Tabela inválida.');
  const keys = Object.keys(row);
  if (keys.some((k) => !/^[a-zA-Z]+$/.test(k)))
    throw new Error('Campo inválido.');
  return database()
    .prepare(
      `INSERT ${ignore ? 'OR IGNORE ' : ''}INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    )
    .bind(
      ...keys.map((k) => {
        const v = row[k];
        return typeof v === 'object'
          ? JSON.stringify(v)
          : (v as string | number | null);
      }),
    );
}
/**
 * Adds columns the database may not have received yet: the brand lifecycle
 * (status, deletedAt) and the files attached to a piece (attachments). Runs
 * once per server instance; a column that already exists is ignored, so it is
 * safe alongside any manual migration.
 */
const runtimeColumns: [table: string, column: string, ddl: string][] = [
  ['brands', 'status', "ALTER TABLE brands ADD COLUMN status TEXT NOT NULL DEFAULT 'active'"],
  ['brands', 'deletedAt', 'ALTER TABLE brands ADD COLUMN deletedAt TEXT'],
  ['content_items', 'attachments', "ALTER TABLE content_items ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'"],
];
let lifecycleReady: Promise<void> | null = null;
export function ensureBrandLifecycle() {
  lifecycleReady ??= (async () => {
    const db = database();
    const columns = new Map<string, string[]>();
    for (const [table, name, ddl] of runtimeColumns) {
      if (!columns.has(table))
        columns.set(
          table,
          (
            await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()
          ).results.map((c) => c.name),
        );
      if (!columns.get(table)!.includes(name))
        await db
          .prepare(ddl)
          .run()
          .catch((e: Error) => {
            if (!/duplicate column/i.test(e.message)) throw e;
          });
    }
  })().catch((e) => {
    lifecycleReady = null;
    throw e;
  });
  return lifecycleReady;
}
/**
 * Permanently removes brands that stayed in the trash longer than
 * BRAND_TRASH_DAYS, with everything linked to them (children first), then
 * their stored files. Checked at most once an hour per server instance.
 */
let lastPurge = 0;
export async function purgeExpiredBrands(workspaceId: string) {
  if (Date.now() - lastPurge < 60 * 60 * 1000) return;
  lastPurge = Date.now();
  const db = database();
  const expired = (
    await db
      .prepare(
        'SELECT id,avatarUrl FROM brands WHERE workspaceId=? AND deletedAt IS NOT NULL AND deletedAt<?',
      )
      .bind(workspaceId, purgeCutoff())
      .all<{ id: string; avatarUrl: string }>()
  ).results;
  for (const brand of expired) {
    try {
      const files = (
        await db
          .prepare('SELECT id FROM brand_assets WHERE brandId=?')
          .bind(brand.id)
          .all<{ id: string }>()
      ).results.map((a) => 'brands/' + brand.id + '/' + a.id);
      const contents = 'SELECT id FROM content_items WHERE brandId=?';
      await db.batch(
        [
          `DELETE FROM generated_assets WHERE versionId IN (SELECT id FROM content_versions WHERE contentId IN (${contents}))`,
          ...[
            'approvals',
            'comments',
            'trello_cards',
            'trello_exports',
            'image_requests',
            'content_versions',
          ].map((t) => `DELETE FROM ${t} WHERE contentId IN (${contents})`),
          ...[
            'magnific_jobs',
            'content_items',
            'monthly_plans',
            'special_dates',
            'brand_assets',
            'brand_guidelines',
            'products',
            'services',
            'content_pillars',
          ].map((t) => `DELETE FROM ${t} WHERE brandId=?`),
          'DELETE FROM brands WHERE id=? AND deletedAt IS NOT NULL',
        ].map((sql) => db.prepare(sql).bind(brand.id)),
      );
      const avatar = /^\/api\/avatars\/([A-Za-z0-9-]+)$/.exec(brand.avatarUrl || '')?.[1];
      if (avatar) files.push('avatars/' + avatar);
      for (const key of files) await bucket().delete(key).catch(() => {});
    } catch (error) {
      console.error('brand purge', brand.id, error);
    }
  }
}
export async function readState(request?: Request): Promise<State> {
  const db = database();
  await ensureBrandLifecycle();
  const workspace = await activeWorkspace(request);
  await purgeExpiredBrands(workspace.id).catch((e) =>
    console.error('brand purge', e),
  );
  // Brands in the trash, and everything linked to them, leave every screen.
  const results = await db.batch(
    [
      'brands',
      'content_items',
      'content_versions',
      'brand_assets',
      'comments',
      'special_dates',
      'monthly_plans',
      'deleted_brands',
    ].map((t) =>
      db.prepare(t === 'brands'
       ? 'SELECT * FROM brands WHERE workspaceId=? AND deletedAt IS NULL'
       : t === 'deleted_brands'
       ? 'SELECT id,name,segment,avatarUrl,deletedAt FROM brands WHERE workspaceId=? AND deletedAt IS NOT NULL ORDER BY deletedAt DESC'
       : ['content_versions','comments'].includes(t)
       ? `SELECT t.* FROM ${t} t JOIN content_items c ON t.contentId=c.id JOIN brands b ON c.brandId=b.id WHERE b.workspaceId=? AND b.deletedAt IS NULL AND c.deletedAt IS NULL`
       : t === 'special_dates'
       ? "SELECT t.* FROM special_dates t LEFT JOIN brands b ON t.brandId=b.id WHERE (b.workspaceId=? AND b.deletedAt IS NULL) OR t.isGlobal=1"
       : `SELECT t.* FROM ${t} t JOIN brands b ON t.brandId=b.id WHERE b.workspaceId=? AND b.deletedAt IS NULL${t==='content_items'?' AND t.deletedAt IS NULL':''}`
      ).bind(workspace.id),
    ),
  );
  const recomposed = new Set(
    (results[3].results as unknown as Asset[])
      .filter(isRecomposedStory)
      .map((a) => a.url),
  );
  return {
    workspace,
    workspaces: (await db.prepare('SELECT id,name,avatarUrl FROM workspaces ORDER BY createdAt,id').all()).results as {id:string;name:string;avatarUrl:string}[],
    brands: (
      results[0].results as unknown as (Omit<Brand, 'pillars'> & {
        pillars: string;
      })[]
    ).map((b) => ({
      ...b,
      status: b.status === 'inactive' ? 'inactive' : 'active',
      pillars: JSON.parse(b.pillars),
    })),
    deletedBrands: results[7].results as unknown as DeletedBrand[],
    contents: (
      results[1].results as unknown as (Omit<Content, 'attachments'> & {
        attachments?: string;
      })[]
    ).map((c) => ({ ...c, attachments: parseIds(c.attachments) })),
    versions: (
      results[2].results as unknown as (Omit<Version, 'hashtags'> & {
        hashtags: string;
      })[]
    ).map((v) => {
      // Safe runtime migration for databases that have not yet applied the
      // SQL migration. Existing Story files remain in the Library; the Feed
      // source becomes canonical for the shared creation.
      const asset = v.feedUrl || v.storyUrl || '';
      // The Story canvas is the AI recomposition of this same art when it
      // exists (story-<source id>); otherwise it shows the Feed art itself.
      const story = storyAdaptationUrl(asset);
      return {
        ...v,
        hashtags: JSON.parse(v.hashtags),
        feedUrl: asset,
        storyUrl: story && recomposed.has(story) ? story : asset,
      };
    }),
    // story-* files stay out of the Library. Only AI recompositions are used
    // as the Story canvas; the old blurred previews are ignored.
    storyAssets: (results[3].results as unknown as Asset[]).filter(isRecomposedStory),
    assets: (results[3].results as unknown as Asset[]).filter((a) => !isStoryAdaptation(a)).map((a) => ({
      ...a,
      category: canonicalCategory(a.category, a.approved),
      description: a.description || '',
      aiNotes: a.aiNotes || '',
      updatedAt: a.updatedAt || a.createdAt,
    })),
    comments: results[4].results as unknown as Comment[],
    dates: (results[5].results as unknown as SpecialDate[]).map((d) => ({
      ...d,
      isGlobal: d.isGlobal === 1 ? 1 : 0,
    })),
    plans: (
      results[6].results as unknown as (Omit<Plan, 'days' | 'selectedDates'> & {
        days: string;
        selectedDates: string;
      })[]
    ).map((p) => ({
      ...p,
      days: JSON.parse(p.days),
      selectedDates: JSON.parse(p.selectedDates),
    })),
  };
}

function parseIds(value: unknown): string[] {
  try {
    const list = JSON.parse(typeof value === 'string' ? value : '[]');
    return Array.isArray(list)
      ? list.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}
export function saveGuidelines(brandId: string, rules: string, now: string) {
  const db = database();
  return [
    db
      .prepare(
        'UPDATE brand_guidelines SET rules=?, updatedAt=? WHERE brandId=?',
      )
      .bind(rules, now, brandId),
    db
      .prepare(
        'INSERT INTO brand_guidelines (id,brandId,rules,updatedAt) SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM brand_guidelines WHERE brandId=?)',
      )
      .bind('guidelines:' + brandId, brandId, rules, now, brandId),
  ];
}
