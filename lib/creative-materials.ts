import type { Asset } from './types';
export function creativeMaterials(brandId: string, assets: Asset[]) {
  if (!brandId || brandId === 'all')
    throw new Error('Escolha uma marca para usar a biblioteca.');
  return assets
    .filter(
      (a) =>
        a.brandId === brandId &&
        a.category !== 'delivery' &&
        (!/gerad[ao]|criativo gerado/i.test(a.aiNotes || '') ||
          a.approved === 1 ||
          a.priority === 1),
    )
    .sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
}
function score(a: Asset) {
  return (
    (a.category === 'logo'
      ? 100
      : a.category === 'brandbook'
        ? 90
        : a.approved
          ? 70
          : 0) +
    (a.priority ? 50 : 0) +
    (/logo principal/i.test(a.name) ? 10 : 0)
  );
}
export function base64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 16384)
    binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(binary);
}

/** Most files a piece can carry to the image model as its own products. */
export const MAX_ATTACHMENTS = 6;
const attachableMimes = ['image/png', 'image/jpeg', 'image/webp'];

/** A library image of this brand that can be attached to a piece. */
export function isAttachable(asset: Asset, brandId: string) {
  return (
    asset.brandId === brandId &&
    asset.category !== 'delivery' &&
    attachableMimes.includes(asset.mime) &&
    !asset.id.startsWith('story-')
  );
}

/**
 * Validates the files attached to a piece: unique ids, at most
 * MAX_ATTACHMENTS, each an image of the piece's brand.
 */
export function validateAttachments(
  value: unknown,
  brandId: string,
  assets: Asset[],
): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((id) => typeof id !== 'string'))
    throw new Error('Anexos inválidos.');
  const ids = [...new Set(value as string[])];
  if (ids.length > MAX_ATTACHMENTS)
    throw new Error(`Anexe até ${MAX_ATTACHMENTS} arquivos por peça.`);
  if (
    ids.some((id) => !assets.some((a) => a.id === id && isAttachable(a, brandId)))
  )
    throw new Error('Anexe apenas imagens da biblioteca desta marca.');
  return ids;
}

/**
 * Materials for one piece. With files attached, the model receives the brand
 * identity (logos and manual) plus exactly those files, so it does not pick a
 * different product from the library. Without attachments it falls back to
 * the whole brand library.
 */
export function pieceMaterials(
  brandId: string,
  assets: Asset[],
  attachments: string[] = [],
) {
  const attached = attachments
    .map((id) => assets.find((a) => a.id === id && isAttachable(a, brandId)))
    .filter((a): a is Asset => !!a);
  if (!attached.length)
    return { materials: creativeMaterials(brandId, assets), attached };
  const identity = creativeMaterials(brandId, assets).filter(
    (a) =>
      (a.category === 'logo' || a.category === 'brandbook') &&
      !attached.some((x) => x.id === a.id),
  );
  return { materials: [...identity, ...attached], attached };
}
