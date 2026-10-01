/**
 * Brand lifecycle: active → inactive (hidden, data kept) and the trash
 * (deleted, restorable for BRAND_TRASH_DAYS, then purged). Pure helpers so
 * they can be tested in Node.
 */
import type { Brand, State } from './types';

export const BRAND_TRASH_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export function isInactive(brand: Pick<Brand, 'status'>) {
  return brand.status === 'inactive';
}

/** Whole days left before a deleted brand is purged (never below 0). */
export function trashDaysLeft(deletedAt: string, now = Date.now()) {
  const at = Date.parse(deletedAt);
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, Math.ceil((at + BRAND_TRASH_DAYS * DAY - now) / DAY));
}

/** ISO cutoff: brands deleted before it are purged for good. */
export function purgeCutoff(now = Date.now()) {
  return new Date(now - BRAND_TRASH_DAYS * DAY).toISOString();
}

/**
 * The state every screen except Marcas works with: inactive brands and
 * everything linked to them (contents, versions, comments, files, plans and
 * brand-specific dates) are left out. Global dates stay.
 */
export function activeState<T extends State>(state: T): T {
  const hidden = new Set(state.brands.filter(isInactive).map((b) => b.id));
  if (!hidden.size) return state;
  const contents = state.contents.filter((c) => !hidden.has(c.brandId));
  const contentIds = new Set(contents.map((c) => c.id));
  return {
    ...state,
    brands: state.brands.filter((b) => !hidden.has(b.id)),
    contents,
    versions: state.versions.filter((v) => contentIds.has(v.contentId)),
    comments: state.comments.filter((c) => contentIds.has(c.contentId)),
    assets: state.assets.filter((a) => !hidden.has(a.brandId)),
    storyAssets: state.storyAssets?.filter((a) => !hidden.has(a.brandId)),
    plans: state.plans.filter((p) => !hidden.has(p.brandId)),
    dates: state.dates.filter(
      (d) => d.isGlobal === 1 || !d.brandId || !hidden.has(d.brandId),
    ),
  };
}
