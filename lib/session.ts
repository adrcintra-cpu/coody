import { createHmac, timingSafeEqual, scryptSync, randomBytes } from 'node:crypto';
import type { CurrentUser } from './identity';
const lifetime = 60 * 60 * 12;
/** Claims of an invited person's session (absent for the owner). */
export type MemberClaims = { uid: string; ver: number };
export function signSession(ownerEmail: string, secret: string, now = Date.now(), member?: MemberClaims) {
  if (secret.length < 32) throw new Error('Autenticação não configurada.');
  const payload = Buffer.from(JSON.stringify({ email: ownerEmail.toLowerCase(), exp: Math.floor(now/1000) + lifetime, ...(member ? { uid: member.uid, ver: member.ver } : {}) })).toString('base64url');
  return payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url');
}
/** Verified token payload, or null. */
export function sessionClaims(request: Request, secret: string, now = Date.now()): { email: string; uid?: string; ver?: number } | null {
  if (secret.length < 32) return null;
  const token = request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('coody_session='))?.slice(14);
  if (!token || token.length > 2048) return null;
  try {
    const [payload, signature, extra] = token.split('.');
    if (extra || !payload || !signature) return null;
    const actual = Buffer.from(signature, 'base64url');
    const expected = createHmac('sha256', secret).update(payload).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!Number.isFinite(data.exp) || data.exp <= Math.floor(now/1000) || typeof data.email !== 'string') return null;
    return { email: data.email, uid: typeof data.uid === 'string' ? data.uid : undefined, ver: Number.isFinite(data.ver) ? data.ver : undefined };
  } catch { return null; }
}
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
export function readSession(request: Request, ownerEmail: string, secret: string, now = Date.now()): CurrentUser | Response {
  const denied = () => Response.json({ error: 'Entre com sua conta para acessar o COODY.', loginRequired: true }, { status: 401 });
  if (!ownerEmail || secret.length < 32) return denied();
  const token = request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith('coody_session='))?.slice(14);
  if (!token || token.length > 2048) return denied();
  try {
    const [payload, signature, extra] = token.split('.');
    if (extra || !payload || !signature) return denied();
    const actual = Buffer.from(signature, 'base64url');
    const expected = createHmac('sha256', secret).update(payload).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return denied();
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!Number.isFinite(data.exp) || data.exp <= Math.floor(now/1000) || data.email !== ownerEmail.toLowerCase()) return denied();
    return { id: 'owner', email: ownerEmail.toLowerCase(), name: 'Administrador', role: 'ADMINISTRADOR' };
  } catch { return denied(); }
}
export function checkPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash || password.length > 256) return false;
  const expected = Buffer.from(hash, 'hex');
  if (expected.length !== 64) return false;
  return timingSafeEqual(scryptSync(password, salt, 64), expected);
}
