import { assetLimitMB } from '@/lib/upload-limits';
import { validateFileStructure } from './upload-structure';
import type { Asset } from './types';
import { canonicalCategory, assetCategories } from './brand-memory';
import { textValue } from './brand-validation';
const allowed = new Map([
  ['image/png', ['png']],
  ['image/jpeg', ['jpg', 'jpeg']],
  ['image/webp', ['webp']],
  ['image/svg+xml', ['svg']],
  ['application/pdf', ['pdf']],
]);
export async function validateUpload(file: unknown) {
  if (!(file instanceof File) || file.size > assetLimitMB * 1024 * 1024 || !file.size)
    throw new Error(`Envie um arquivo de até ${assetLimitMB} MB.`);
  if (
    !allowed
      .get(file.type)
      ?.includes(file.name.split('.').pop()?.toLowerCase() || '')
  )
    throw new Error('Use PDF, SVG, PNG, JPG ou WEBP.');
  const bytes = await file.arrayBuffer();
  const sig = new Uint8Array(bytes.slice(0, 12));
  const ascii = new TextDecoder().decode(sig);
  if (
    (file.type === 'application/pdf' && !ascii.startsWith('%PDF-')) ||
    (file.type === 'image/png' &&
      !(sig[0] === 137 && ascii.slice(1, 4) === 'PNG')) ||
    (file.type === 'image/jpeg' &&
      !(sig[0] === 255 && sig[1] === 216 && sig[2] === 255)) ||
    (file.type === 'image/webp' &&
      !(ascii.startsWith('RIFF') && ascii.slice(8) === 'WEBP'))
  )
    throw new Error('O conteúdo do arquivo não corresponde ao formato.');
  if (file.type === 'image/svg+xml') {
    const svg = new TextDecoder().decode(bytes);
    if (
      !/<svg[\s>]/i.test(svg) ||
      /<(?:script|foreignObject|iframe|object|embed|image|use|style|animate|set)\b|\bon\w+\s*=|(?:href|src)\s*=|url\s*\(|<!ENTITY/i.test(
        svg,
      )
    )
      throw new Error(
        'Este SVG contém recursos ativos. Exporte uma versão simples ou PNG.',
      );
  }

  validateFileStructure(bytes, file.type);
  return { file, bytes };
}
export function assetRecord(
  file: File,
  brandId: string,
  input: Record<string, unknown>,
): Asset {
  const raw = textValue(input.category) || 'material';
  const category = canonicalCategory(raw);
  if (
    !assetCategories.some((c) => c.value === raw) &&
    ![
      'Brandbook',
      'Logos',
      'Produtos',
      'Fotografias',
      'Campanhas',
      'Referências visuais',
      'Posts anteriores',
      'Artes aprovadas',
      'Materiais institucionais',
      'Outros',
    ].includes(raw)
  )
    throw new Error('Categoria inválida.');
  const id = crypto.randomUUID(),
    now = new Date().toISOString();
  return {
    id,
    brandId,
    name: textValue(input.name, 200) || file.name.slice(0, 200),
    category,
    mime: file.type,
    url: '/api/assets/' + id,
    description: textValue(input.description),
    aiNotes: textValue(input.aiNotes),
    priority:
      input.priority === true ||
      input.priority === 1 ||
      input.priority === 'true' ||
      input.priority === '1'
        ? 1
        : 0,
    approved: category === 'approved_art' ? 1 : 0,
    createdAt: now,
    updatedAt: now,
  };
}
export async function limitedForm(request: Request, maxBytes: number) {
  if (Number(request.headers.get('content-length')) > maxBytes)
    throw new Error('O envio ultrapassa o limite total de arquivos.');
  if (!request.body) throw new Error('Envio vazio.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('O envio ultrapassa o limite total de arquivos.');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  chunks.length = 0;
  return new Response(bytes, {
    headers: { 'Content-Type': request.headers.get('content-type') || '' },
  }).formData();
}
