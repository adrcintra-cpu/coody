import { createHash, randomBytes } from 'node:crypto';
import { database } from './repository';
import type { Role } from './permissions';

/**
 * People invited to the COODY (besides the owner): their role, the
 * workspaces released to them and one-time invite links. Tables are created
 * on first use (no manual migration).
 */
let ready: Promise<unknown> | null = null;
export function ensureMembers() {
  ready ??= database()
    .batch(
      [
        `CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL, passwordHash TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'invited', sessionVersion INTEGER NOT NULL DEFAULT 1, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`,
        'CREATE TABLE IF NOT EXISTS member_workspaces (memberId TEXT NOT NULL, workspaceId TEXT NOT NULL, PRIMARY KEY (memberId, workspaceId))',
        'CREATE TABLE IF NOT EXISTS member_invites (tokenHash TEXT PRIMARY KEY NOT NULL, memberId TEXT NOT NULL, expiresAt TEXT NOT NULL, usedAt TEXT)',
      ].map((sql) => database().prepare(sql)),
    )
    .catch((e) => {
      ready = null;
      throw e;
    });
  return ready;
}

export type Member = {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  status: 'invited' | 'active' | 'disabled';
  sessionVersion: number;
};

export async function memberById(id: string) {
  await ensureMembers();
  return database()
    .prepare('SELECT * FROM members WHERE id=?')
    .bind(id)
    .first<Member>();
}
export async function memberByEmail(email: string) {
  await ensureMembers();
  return database()
    .prepare('SELECT * FROM members WHERE email=?')
    .bind(email.trim().toLowerCase())
    .first<Member>();
}
export async function memberWorkspaces(id: string) {
  await ensureMembers();
  return (
    await database()
      .prepare('SELECT workspaceId FROM member_workspaces WHERE memberId=?')
      .bind(id)
      .all<{ workspaceId: string }>()
  ).results.map((r) => r.workspaceId);
}

export const INVITE_DAYS = 7;
export function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
/** New one-time invite link token (older links of this person stop working). */
export async function createInvite(memberId: string) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + INVITE_DAYS * 864e5).toISOString();
  await database().batch([
    database()
      .prepare('DELETE FROM member_invites WHERE memberId=? AND usedAt IS NULL')
      .bind(memberId),
    database()
      .prepare('INSERT INTO member_invites (tokenHash,memberId,expiresAt) VALUES (?,?,?)')
      .bind(tokenHash(token), memberId, expires),
  ]);
  return { token, expires };
}
export async function inviteByToken(token: string) {
  await ensureMembers();
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token || '')) return null;
  const row = await database()
    .prepare(
      'SELECT i.memberId,i.expiresAt,i.usedAt,m.name,m.email,m.status FROM member_invites i JOIN members m ON m.id=i.memberId WHERE i.tokenHash=?',
    )
    .bind(tokenHash(token))
    .first<{ memberId: string; expiresAt: string; usedAt: string | null; name: string; email: string; status: string }>();
  if (!row || row.usedAt || row.status === 'disabled' || row.expiresAt < new Date().toISOString())
    return null;
  return row;
}
