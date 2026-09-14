import type { Asset } from './types';
export function creativeMaterials(brandId: string, assets: Asset[]) {
  if (!brandId || brandId === 'all')
    throw new Error('Escolha uma marca para usar a biblioteca.');
  return assets
    .filter(
      (a) =>
        a.brandId === brandId &&
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
