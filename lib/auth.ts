import { sessionClaims } from './session';
import { env } from 'cloudflare:workers';
import { identify, type CurrentUser } from './identity';
import { database } from './repository';
import { memberById } from './members';
import { isRole, can, deniedMessage, type Permission } from './permissions';

const denied = () =>
  Response.json(
    { error: 'Entre com sua conta para acessar o COODY.', loginRequired: true },
    { status: 401 },
  );
// One check per request (routes and activeWorkspace both ask).
const cache = new WeakMap<Request, CurrentUser | Response>();

/**
 * The signed-in person: the owner (COODY_OWNER_EMAIL) or an invited member
 * whose access is still active. A member removed, disabled or changed by an
 * administrator loses the session at once (sessionVersion).
 */
export async function authorize(request: Request): Promise<CurrentUser | Response> {
  const hit = cache.get(request);
  if (hit) return hit;
  const result = await resolve(request);
  cache.set(request, result);
  return result;
}
async function resolve(request: Request): Promise<CurrentUser | Response> {
  const config = env as unknown as Record<string, unknown>;
  const owner =
    typeof config.COODY_OWNER_EMAIL === 'string'
      ? config.COODY_OWNER_EMAIL.trim().toLowerCase()
      : '';
  if (config.COODY_RUNTIME !== 'vercel') return identify(request.headers, owner);
  const secret =
    typeof config.COODY_SESSION_SECRET === 'string' ? config.COODY_SESSION_SECRET : '';
  const claims = sessionClaims(request, secret);
  if (!claims || !owner) return denied();
  if (!claims.uid)
    return claims.email === owner
      ? { id: 'owner', email: owner, name: 'Administrador', role: 'ADMINISTRADOR' }
      : denied();
  try {
    const member = await memberById(claims.uid);
    if (
      !member ||
      member.status !== 'active' ||
      member.sessionVersion !== claims.ver ||
      member.email !== claims.email ||
      !isRole(member.role)
    )
      return denied();
    return {
      id: member.id,
      email: member.email,
      name: member.name,
      role: member.role,
      member: true,
    };
  } catch {
    return denied();
  }
}
export async function registerUser(user: {
  id: string;
  name: string;
  role: string;
}) {
  await database()
    .prepare(
      'INSERT INTO users (id,name,role) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,role=excluded.role',
    )
    .bind(user.id, user.name, user.role)
    .run();
}

/** 403 with a clear message when the person's role lacks the permission. */
export function forbid(user: CurrentUser, permission: Permission): Response | null {
  return can(user.role, permission)
    ? null
    : Response.json({ error: deniedMessage(permission) }, { status: 403 });
}
