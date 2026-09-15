import { env } from 'cloudflare:workers';
import { canonicalCategory } from './brand-memory';
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
  const results = await db.batch(
    [
      'brands',
      'content_items',
      'content_versions',
      'brand_assets',
      'comments',
      'special_dates',
      'monthly_plans',
    ].map((t) =>
      db.prepare(
        `SELECT * FROM ${t}${t === 'content_items' ? ' WHERE deletedAt IS NULL' : ''}`,
      ),
    ),
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
