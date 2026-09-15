export type CurrentUser = {
  avatarUrl?: string;
  id: string;
  name: string;
  email: string;
  role: 'ADMINISTRADOR';
};
export function identify(
  headers: Headers,
  ownerEmail: string,
): CurrentUser | Response {
  const id = headers.get('oai-authenticated-user-id')?.trim();
  const email = headers
    .get('oai-authenticated-user-email')
    ?.trim()
    .toLowerCase();
  if (!id || !email)
    return Response.json(
      { error: 'Entre com sua conta para acessar o COODY.' },
      { status: 401 },
    );
  if (!ownerEmail || email !== ownerEmail.trim().toLowerCase())
    return Response.json(
      { error: 'Esta conta não tem acesso a este workspace.' },
      { status: 403 },
    );
  let name = headers.get('oai-authenticated-user-full-name') || email;
  if (
    headers.get('oai-authenticated-user-full-name-encoding') ===
    'percent-encoded-utf-8'
  ) {
    try {
      name = decodeURIComponent(name);
    } catch {
      name = email;
    }
  }
  return { id, email, name: name.slice(0, 200), role: 'ADMINISTRADOR' };
}
