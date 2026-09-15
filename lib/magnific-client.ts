export class MagnificError extends Error {
 uncertain:boolean;
 constructor(message:string,uncertain=false){super(message);this.uncertain=uncertain;}
}
export async function magnificRequest(
  key: string,
  taskId?: string,
  body?: Record<string, unknown>,
  transport: typeof fetch = fetch,
) {
  if (!key) throw new MagnificError('Chave Magnific não configurada.');
  if (taskId && !/^[a-zA-Z0-9_-]{1,100}$/.test(taskId))
    throw new MagnificError('Identificador Magnific inválido.');
  let response: Response;
  try {
    response = await transport(
      'https://api.magnific.com/v1/ai/text-to-image/flux-2-pro' +
        (taskId ? '/' + taskId : ''),
      {
        method: body ? 'POST' : 'GET',
        headers: {
          'x-magnific-api-key': key,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(45000),
      },
    );
  } catch {
    throw new MagnificError(
      'Conexão Magnific interrompida. Consulte o pedido antes de gerar novamente; ele pode ter sido cobrado.',
      true,
    );
  }
  if (!response.ok) {
    const raw = await response.text();
    if (
      response.status === 402 ||
      /insufficient[_ ](?:credits|balance)|not enough credits/i.test(raw)
    )
      throw new MagnificError(
        'A API Magnific informou créditos insuficientes. Regularize o saldo na conta da API.',
      );
    if (response.status === 401 || response.status === 403)
      throw new MagnificError(
        'A Magnific recusou a chave ou a permissão desta conta.',
      );
    if (response.status === 429)
      throw new MagnificError(
        'Limite de requisições Magnific. O serviço não confirmou falta de créditos.',
      );
    throw new MagnificError(
      'A Magnific recusou o pedido (HTTP ' +
        response.status +
        '). Revise o briefing e as referências.',
    );
  }
  return response.json() as Promise<{
    data: { task_id?: string; status?: string; generated?: string[] };
  }>;
}
export async function verifyMagnificWebhook(
  secret: string,
  headers: Headers,
  body: string,
  now = Date.now(),
) {
  const id = headers.get('webhook-id'),
    timestamp = headers.get('webhook-timestamp'),
    signatures = headers.get('webhook-signature');
  if (
    !secret ||
    !id ||
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300 ||
    !signatures
  )
    return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  for (const signature of signatures.split(' ')) {
    const [version, value] = signature.split(',');
    if (version !== 'v1' || !value) continue;
    try {
      const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
      if (
        await crypto.subtle.verify(
          'HMAC',
          key,
          bytes,
          new TextEncoder().encode(id + '.' + timestamp + '.' + body),
        )
      )
        return true;
    } catch {}
  }
  return false;
}
