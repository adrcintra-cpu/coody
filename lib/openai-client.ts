export class OpenAIError extends Error {}
export async function openaiRequest(
  key: string,
  path: 'responses' | 'images/generations',
  body: Record<string, unknown>,
  transport: typeof fetch = fetch,
) {
  let response: Response;
  try {
    response = await transport('https://api.openai.com/v1/' + path, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(180000),
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new OpenAIError(
      'A conexão com a OpenAI foi interrompida. Confira a biblioteca antes de tentar novamente; um pedido interrompido pode ter sido cobrado.',
    );
  }
  if (!response.ok) {
    const raw = await response.text();
    let result: {error?:{code?:string;type?:string;message?:string}} = {};
    try { result = JSON.parse(raw); } catch { /* Non-JSON gateway failures are not API quota confirmations. */ }
    const code = result?.error?.code;
    const type = result?.error?.type;
    const retry = response.headers.get('retry-after');
    const safe = (value: unknown) => typeof value === 'string' ? value.replaceAll(key, '[redacted]').replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]').slice(0,500) : '';
    console.error('openai_failure', JSON.stringify({path,status:response.status,code:safe(code),type:safe(type),requestId:safe(response.headers.get('x-request-id')),retryAfter:safe(retry),contentType:safe(response.headers.get('content-type')),detail:safe(result?.error?.message || raw)}));
    if ([code,type].some(v=>v==='insufficient_quota' || v==='billing_hard_limit_reached' || v==='billing_not_active'))
      throw new OpenAIError('Créditos ou cota de faturamento da API OpenAI esgotados. Regularize o faturamento do projeto para gerar o criativo.');
    if (response.status === 429) {
      if (code === 'rate_limit_exceeded' || type === 'rate_limit_exceeded') {
        const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : null;
        throw new OpenAIError('A OpenAI confirmou limite de requisições.' + (seconds ? ' Tente novamente em '+seconds+' segundos.' : ' O servidor não informou quando o limite será liberado.'));
      }
      throw new OpenAIError('Pedido bloqueado (HTTP 429), sem confirmação de limite temporário ou falta de créditos. O servidor não informou um horário de liberação. O diagnóstico foi registrado para investigação.');
    }
    if (response.status === 401)
      throw new OpenAIError(
        'A chave OpenAI foi recusada. Atualize a chave do servidor.',
      );
    if (response.status === 403 || response.status === 404)
      throw new OpenAIError(
        'O projeto OpenAI não tem acesso ao modelo solicitado. Verifique permissões e verificação da organização.',
      );
    if (response.status === 400)
      throw new OpenAIError(
        'A OpenAI recusou o pedido. Revise o briefing; nenhuma peça completa foi criada.',
      );
    throw new OpenAIError(
      'A OpenAI não concluiu o pedido. Nenhuma aprovação foi iniciada.',
    );
  }
  return response.json() as Promise<Record<string, unknown>>;
}
export type CreativeText = {
  headline: string;
  copy: string;
  caption: string;
  hashtags: string[];
  visualPrompt: string;
};
export function parseCreative(result: Record<string, unknown>): CreativeText {
  const output = result.output as
    | { type?: string; content?: { type?: string; text?: string }[] }[]
    | undefined;
  const text = output
    ?.filter((o) => o.type === 'message')
    .flatMap((o) => o.content || [])
    .filter((c) => c.type === 'output_text')
    .map((c) => c.text || '')
    .join('');
  let value: CreativeText;
  try {
    value = JSON.parse(text || '');
  } catch {
    throw new OpenAIError(
      'A OpenAI não devolveu um criativo válido. Nenhuma arte foi solicitada.',
    );
  }
  if (
    !value ||
    ['headline', 'copy', 'caption', 'visualPrompt'].some(
      (k) => typeof value[k as keyof CreativeText] !== 'string',
    ) ||
    !value.headline.trim() ||
    value.headline.length > 300 ||
    !value.caption.trim() ||
    value.caption.length > 6000 ||
    !value.visualPrompt.trim() ||
    value.visualPrompt.length > 6000 ||
    value.copy.length > 6000 ||
    !Array.isArray(value.hashtags) ||
    value.hashtags.length !== 5 ||
    value.hashtags.some(
      (t) => typeof t !== 'string' || !/^#[\p{L}\p{N}_]+$/u.test(t),
    ) ||
    new Set(value.hashtags.map((t) => t.toLowerCase())).size !== 5
  )
    throw new OpenAIError(
      'Os textos gerados não passaram na validação. Nenhuma arte foi solicitada.',
    );
  return value;
}
export const creativeSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    headline: { type: 'string' },
    copy: { type: 'string' },
    caption: { type: 'string' },
    hashtags: {
      type: 'array',
      items: { type: 'string' },
      minItems: 5,
      maxItems: 5,
    },
    visualPrompt: { type: 'string' },
  },
  required: ['headline', 'copy', 'caption', 'hashtags', 'visualPrompt'],
};
