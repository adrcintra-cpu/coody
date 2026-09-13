import { env } from 'cloudflare:workers';
import { identify } from './identity';
import { database } from './repository';
export function authorize(request: Request) {
  const config = env as unknown as Record<string, unknown>;
  return identify(
    request.headers,
    typeof config.COODY_OWNER_EMAIL === 'string'
      ? config.COODY_OWNER_EMAIL
      : '',
  );
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
