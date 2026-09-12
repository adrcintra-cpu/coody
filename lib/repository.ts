import { env } from 'cloudflare:workers';
import { canonicalCategory } from './brand-memory';
import { demoState } from './demo';
import type {
  State,
  Brand,
  Content,
  Version,
  Asset,
  Plan,
  Comment,
  SpecialDate,
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
export async function readState(): Promise<State> {
  const db = database();
  const initialized = await db
    .prepare('SELECT id FROM users WHERE id = ?')
    .bind('demo-admin')
    .first();
  if (!initialized) {
    const seed = demoState();
    await db.batch([
      insert(
        'users',
        { id: 'demo-admin', name: 'Agência criativa', role: 'ADMINISTRADOR' },
        true,
      ),
      ...seed.brands.map((b) => insert('brands', b, true)),
      ...seed.contents.map((c) => insert('content_items', c, true)),
      ...seed.versions.map((v) => insert('content_versions', v, true)),
      ...seed.dates.map((d) => insert('special_dates', d, true)),
      ...seed.comments.map((c) => insert('comments', c, true)),
    ]);
  }
  const results = await db.batch(
    [
      'brands',
      'content_items',
      'content_versions',
      'brand_assets',
      'comments',
      'special_dates',
      'monthly_plans',
    ].map((t) => db.prepare(`SELECT * FROM ${t}`)),
  );
  return {
    brands: (
      results[0].results as unknown as (Omit<Brand, 'pillars'> & {
        pillars: string;
      })[]
    ).map((b) => ({ ...b, pillars: JSON.parse(b.pillars) })),
    contents: results[1].results as unknown as Content[],
    versions: (
      results[2].results as unknown as (Omit<Version, 'hashtags'> & {
        hashtags: string;
      })[]
    ).map((v) => ({ ...v, hashtags: JSON.parse(v.hashtags) })),
    assets: (results[3].results as unknown as Asset[]).map((a) => ({
      ...a,
      category: canonicalCategory(a.category, a.approved),
      description: a.description || '',
      aiNotes: a.aiNotes || '',
      updatedAt: a.updatedAt || a.createdAt,
    })),
    comments: results[4].results as unknown as Comment[],
    dates: (results[5].results as unknown as SpecialDate[]).map((d) => ({
      ...d,
      isGlobal: d.isGlobal === 1 || ['d1', 'd2'].includes(d.id) ? 1 : 0,
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
