import { randomBytes } from 'node:crypto';
import { database, ensureBrandLifecycle } from './repository';

/**
 * Client links: one private link per brand that opens the production board
 * and the month plan without login. The client can approve or ask for
 * ajuste/alteração. A new link replaces the previous one; revoking ends it.
 */
let ready: Promise<unknown> | null = null;
export function ensureShareLinks() {
  ready ??= database()
    .prepare(
      'CREATE TABLE IF NOT EXISTS share_links (token TEXT PRIMARY KEY NOT NULL, brandId TEXT NOT NULL, workspaceId TEXT NOT NULL, createdBy TEXT NOT NULL, createdAt TEXT NOT NULL, revokedAt TEXT)',
    )
    .run()
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}
export function newShareToken() {
  return randomBytes(24).toString('base64url');
}
export async function shareByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token || '')) return null;
  await ensureShareLinks();
  await ensureBrandLifecycle();
  return database()
    .prepare(
      'SELECT s.token,s.brandId,s.workspaceId FROM share_links s JOIN brands b ON b.id=s.brandId WHERE s.token=? AND s.revokedAt IS NULL AND b.deletedAt IS NULL',
    )
    .bind(token)
    .first<{ token: string; brandId: string; workspaceId: string }>();
}
export async function activeShare(brandId: string) {
  await ensureShareLinks();
  return database()
    .prepare('SELECT token,createdAt FROM share_links WHERE brandId=? AND revokedAt IS NULL ORDER BY createdAt DESC LIMIT 1')
    .bind(brandId)
    .first<{ token: string; createdAt: string }>();
}
