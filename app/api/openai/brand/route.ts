import { env } from 'cloudflare:workers';
import { authorize } from '@/lib/auth';
import { apiAlert } from '@/lib/workspaces';
import { activeState } from '@/lib/brand-lifecycle';
import { readState } from '@/lib/repository';
import { libraryInputs } from '@/lib/library-inputs';
import { base64 } from '@/lib/creative-materials';
import { limitedForm, validateUpload } from '@/lib/asset-upload';
import { OpenAIError, openaiRequest } from '@/lib/openai-client';
import {
  assistFields,
  brandAssistInstructions,
  brandAssistSchema,
  parseSuggestion,
  publicSiteUrl,
  siteText,
} from '@/lib/brand-assist';

const model = 'gpt-4.1-mini';
const MAX_FILES = 4;
function apiKey() {
  return (env as unknown as Record<string, string>).OPENAI_API_KEY || '';
}

/**
 * Reads the public website of the brand (HTML only, up to 1.5 MB, 3
 * redirects, each hop checked against publicSiteUrl). Returns the readable
 * text, or a short reason when the site could not be read.
 */
async function readSite(raw: string): Promise<{ text: string; note: string }> {
  let url = publicSiteUrl(raw);
  if (!raw.trim()) return { text: '', note: '' };
  if (!url) return { text: '', note: 'O endereço do site não é público.' };
  try {
    for (let hop = 0; hop < 4; hop++) {
      const response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
        headers: {
          'User-Agent': 'COODY/1.0 (cadastro de marca)',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (response.status >= 300 && response.status < 400) {
        const next = publicSiteUrl(
          new URL(response.headers.get('location') || '', url).toString(),
        );
        if (!next) return { text: '', note: 'O site redireciona para um endereço não público.' };
        url = next;
        continue;
      }
      if (!response.ok || !response.body)
        return { text: '', note: `O site respondeu com erro ${response.status}.` };
      if (!/html/i.test(response.headers.get('content-type') || ''))
        return { text: '', note: 'O endereço não é uma página de site.' };
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < 1.5 * 1024 * 1024) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        total += value.length;
      }
      await reader.cancel().catch(() => {});
      const html = new TextDecoder().decode(
        chunks.reduce((all, c) => {
          const merged = new Uint8Array(all.length + c.length);
          merged.set(all);
          merged.set(c, all.length);
          return merged;
        }, new Uint8Array()),
      );
      const text = siteText(html);
      return text
        ? { text, note: '' }
        : { text: '', note: 'O site não tem texto legível (pode depender de JavaScript).' };
    }
    return { text: '', note: 'O site redireciona demais.' };
  } catch {
    return { text: '', note: 'Não foi possível abrir o site.' };
  }
}

/**
 * POST multipart: payload = { brandId?, brand }, files = up to 4 PDFs or
 * images (manual, logos) not yet saved. For an existing brand, its logos and
 * manual from the Library are read instead. Returns suggestions only; the
 * form decides what to fill and the user saves.
 */
export async function POST(request: Request) {
  const user = authorize(request);
  if (user instanceof Response) return user;
  if (
    request.headers.get('origin') &&
    request.headers.get('origin') !== new URL(request.url).origin
  )
    return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  if (!apiKey())
    return Response.json(
      { error: 'Configure a chave OpenAI no servidor para preencher com IA.' },
      { status: 503 },
    );
  try {
    const form = await limitedForm(request, 4.4 * 1024 * 1024);
    const payload = JSON.parse(String(form.get('payload') || '{}')) as {
      brandId?: unknown;
      brand?: Record<string, unknown>;
    };
    const input = payload.brand || {};
    const text = (k: string, max = 3000) =>
      typeof input[k] === 'string' ? (input[k] as string).trim().slice(0, max) : '';
    const name = text('name', 200);
    const segment = text('segment', 200);
    if (!name || !segment)
      throw new Error('Preencha o nome e o segmento da marca antes de usar a IA.');
    const content: Record<string, unknown>[] = [];
    let filesRead = 0;
    if (typeof payload.brandId === 'string' && payload.brandId) {
      // Existing brand: its official identity files from the Library.
      const state = activeState(await readState(request));
      if (!state.brands.some((b) => b.id === payload.brandId))
        throw new Error('Marca não encontrada neste workspace.');
      const identity = state.assets
        .filter(
          (a) =>
            a.brandId === payload.brandId &&
            ['logo', 'brandbook'].includes(a.category) &&
            ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(a.mime),
        )
        .sort((a, b) => Number(b.category === 'brandbook') - Number(a.category === 'brandbook') || b.priority - a.priority)
        .slice(0, MAX_FILES);
      if (identity.length) {
        const inputs = await libraryInputs(identity);
        content.push(...inputs.content);
        filesRead = identity.length;
      }
    } else {
      const files = form.getAll('files').slice(0, MAX_FILES);
      for (const entry of files) {
        const { file, bytes } = await validateUpload(entry);
        if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type))
          continue;
        content.push(
          file.type === 'application/pdf'
            ? {
                type: 'input_file',
                filename: file.name.endsWith('.pdf') ? file.name : file.name + '.pdf',
                file_data: 'data:application/pdf;base64,' + base64(new Uint8Array(bytes)),
              }
            : {
                type: 'input_image',
                image_url: 'data:' + file.type + ';base64,' + base64(new Uint8Array(bytes)),
                detail: 'high',
              },
        );
        filesRead++;
      }
    }
    const site = await readSite(text('website', 500));
    const known = Object.fromEntries(
      [
        'name',
        'segment',
        'website',
        'instagram',
        'linkedin',
        'social',
        'notes',
        ...assistFields.map(([k]) => k),
      ]
        .map((k) => [k, text(k)])
        .filter(([, v]) => v),
    );
    const result = await openaiRequest(apiKey(), 'responses', {
      model,
      store: false,
      instructions: brandAssistInstructions,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                camposPreenchidos: known,
                site: site.text || '(site não disponível)',
                arquivos: filesRead
                  ? `${filesRead} arquivo(s) da identidade anexado(s) a seguir`
                  : '(nenhum arquivo)',
              }),
            },
            ...content,
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'brand',
          strict: true,
          schema: brandAssistSchema,
        },
      },
    });
    const output = (
      result.output as
        | { type?: string; content?: { type?: string; text?: string }[] }[]
        | undefined
    )
      ?.filter((o) => o.type === 'message')
      .flatMap((o) => o.content || [])
      .filter((c) => c.type === 'output_text')
      .map((c) => c.text || '')
      .join('');
    let parsed: unknown;
    try {
      parsed = JSON.parse(output || '');
    } catch {
      throw new OpenAIError('A OpenAI não devolveu sugestões válidas. Tente novamente.');
    }
    return Response.json({
      suggestion: parseSuggestion(parsed),
      sources: {
        site: site.text ? 'lido' : site.note,
        files: filesRead,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error &&
      !['TimeoutError', 'TypeError', 'SyntaxError'].includes(error.name)
        ? error.message
        : 'Não foi possível preencher com IA. Tente novamente.';
    if (error instanceof OpenAIError)
      await apiAlert(request, 'OpenAI', message).catch(() => {});
    return Response.json({ error: message }, { status: 400 });
  }
}
