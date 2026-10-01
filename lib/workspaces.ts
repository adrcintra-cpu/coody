import { database, ensureBrandLifecycle } from './repository';
export const defaultWorkspace = 'main';
export async function activeWorkspace(request?: Request) {
  await database()
    .prepare(
      "INSERT OR IGNORE INTO workspaces (id,name,avatarUrl,createdAt) VALUES ('main','Meu workspace','',?)",
    )
    .bind(new Date().toISOString())
    .run();
  const id =
    request?.headers
      .get('cookie')
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('coody_workspace='))
      ?.slice(16) || defaultWorkspace;
  const row = await database()
    .prepare('SELECT id,name,avatarUrl FROM workspaces WHERE id=?')
    .bind(id)
    .first<{ id: string; name: string; avatarUrl: string }>();
  if (!row)
    throw new Error('Workspace não encontrado. Selecione outro workspace.');
  return row;
}
export async function assertBrandWorkspace(request: Request, brandId: string) {
  const w = await activeWorkspace(request);
  await ensureBrandLifecycle();
  // Brands in the trash accept no new files or changes.
  if (
    !(await database()
      .prepare('SELECT id FROM brands WHERE id=? AND workspaceId=? AND deletedAt IS NULL')
      .bind(brandId, w.id)
      .first())
  )
    throw new Error('Marca não encontrada neste workspace.');
  return w;
}
export async function apiAlert(
  request: Request,
  provider: string,
  message: string,
) {
  const w = await activeWorkspace(request);
  await database()
    .prepare(
      'INSERT INTO api_alerts (id,workspaceId,provider,message,createdAt) VALUES (?,?,?,?,?)',
    )
    .bind(
      crypto.randomUUID(),
      w.id,
      provider,
      message.slice(0, 600),
      new Date().toISOString(),
    )
    .run();
}
