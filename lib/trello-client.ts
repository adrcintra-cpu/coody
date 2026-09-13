export type TrelloCredentials = { key: string; token: string };
export function validCredentials(value: unknown): value is TrelloCredentials {
  const c = value as TrelloCredentials;
  return (
    !!c &&
    /^[a-zA-Z0-9]{20,128}$/.test(c.key) &&
    /^[a-zA-Z0-9_-]{20,512}$/.test(c.token)
  );
}
export async function trello<T>(
  credentials: TrelloCredentials,
  path: string,
  init: RequestInit = {},
  transport: typeof fetch = fetch,
): Promise<T> {
  if (!path.startsWith('/') || path.includes('://'))
    throw new Error('Recurso Trello inválido.');
  const headers = new Headers(init.headers);
  headers.set(
    'Authorization',
    `OAuth oauth_consumer_key="${credentials.key}", oauth_token="${credentials.token}"`,
  );
  let response: Response;
  try {
    response = await transport('https://api.trello.com/1' + path, {
      ...init,
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error(
      'Trello não respondeu. Confira a conexão antes de repetir o envio.',
    );
  }
  if (!response.ok)
    throw new Error(
      response.status === 401 || response.status === 403
        ? 'Acesso ao Trello recusado. Reconecte a conta e confira as permissões do quadro.'
        : response.status === 429
          ? 'Limite do Trello atingido. Aguarde um minuto e tente novamente.'
          : 'O Trello não concluiu a operação. Confira o quadro e tente novamente.',
    );
  return (await response.json()) as T;
}
export async function seal(value: TrelloCredentials, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(atob(secret), (c) => c.charCodeAt(0)),
    'AES-GCM',
    false,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(JSON.stringify(value)),
    ),
  );
  return btoa(String.fromCharCode(...iv, ...encrypted));
}
export async function unseal(
  value: string,
  secret: string,
): Promise<TrelloCredentials> {
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'raw',
    Uint8Array.from(atob(secret), (c) => c.charCodeAt(0)),
    'AES-GCM',
    false,
    ['decrypt'],
  );
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes.slice(0, 12) },
    key,
    bytes.slice(12),
  );
  const credentials = JSON.parse(new TextDecoder().decode(decrypted));
  if (!validCredentials(credentials))
    throw new Error('Reconecte sua conta Trello.');
  return credentials;
}
