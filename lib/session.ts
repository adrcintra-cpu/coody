import { createHmac, timingSafeEqual, scryptSync } from 'node:crypto';
import type { CurrentUser } from './identity';
const lifetime = 60 * 60 * 12;
export function signSession(ownerEmail: string, secret: string, now = Date.now()) {
  if (secret.length < 32) throw new Error('Autenticação não configurada.');
  const payload = Buffer.from(JSON.stringify({ email: ownerEmail.toLowerCase(), exp: Math.floor(now/1000) + lifetime })).toString('base64url');
  return payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url');
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
