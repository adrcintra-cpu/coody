import type { Asset, Brand, Content } from './types';
export const assetCategories = [
  {
    value: 'brandbook',
    label: 'Manual da marca',
    role: 'Regras oficiais da identidade',
  },
  {
    value: 'logo',
    label: 'Logotipos',
    role: 'Elementos oficiais que devem ser preservados',
  },
  {
    value: 'visual_reference',
    label: 'Referências visuais',
    role: 'Inspiração visual',
  },
  {
    value: 'approved_art',
    label: 'Artes aprovadas',
    role: 'Estilo visual aprovado pela marca',
  },
  {
    value: 'product_photo',
    label: 'Produtos',
    role: 'Material real para a criação',
  },
  {
    value: 'material',
    label: 'Materiais',
    role: 'Fonte adicional de informação e contexto',
  },
] as const;
export type AssetCategory = (typeof assetCategories)[number]['value'];
const legacyCategories: Record<string, AssetCategory> = {
  Brandbook: 'brandbook',
  Logos: 'logo',
  'Referências visuais': 'visual_reference',
  'Posts anteriores': 'visual_reference',
  Campanhas: 'visual_reference',
  'Artes aprovadas': 'approved_art',
  Produtos: 'product_photo',
  Fotografias: 'product_photo',
  'Materiais institucionais': 'material',
  Outros: 'material',
};
export function canonicalCategory(
  category: string,
  approved = 0,
): AssetCategory {
  if (approved) return 'approved_art';
  return (
    assetCategories.find((c) => c.value === category)?.value ||
    legacyCategories[category] ||
    'material'
  );
}
export function categoryInfo(category: string, approved = 0) {
  return assetCategories.find(
    (c) => c.value === canonicalCategory(category, approved),
  )!;
}
export function requireBrandId(value: string) {
  if (!value?.trim() || ['all', 'todos', 'Todas as marcas'].includes(value))
    throw new Error('Defina uma marca específica para montar o contexto.');
  return value;
}
export function identityCompleteness(brand: Brand, assets: Asset[]) {
  const own = assets.filter((a) => a.brandId === brand.id);
  const has = (c: AssetCategory) =>
    own.some((a) => canonicalCategory(a.category, a.approved) === c);
  const checks = [
    { label: 'Logo', complete: has('logo') },
    { label: 'Cores', complete: !!brand.colors.trim() },
    { label: 'Fontes', complete: !!brand.fonts.trim() },
    {
      label: 'Referências',
      complete: has('visual_reference') || has('approved_art'),
    },
    { label: 'Tom de voz', complete: !!brand.voice.trim() },
    { label: 'Manual da marca', complete: has('brandbook') },
  ];
  return {
    checks,
    percent: Math.round(
      (checks.filter((c) => c.complete).length / checks.length) * 100,
    ),
  };
}
export type ContextAsset = Asset & { semanticRole: string; relevance: number };
export type BrandContext = {
  brand_id: string;
  brand: Brand;
  identity: {
    brandbooks: ContextAsset[];
    logos: ContextAsset[];
    palette: string;
    fonts: string;
  };
  rules: {
    voice: string;
    visualDirection: string;
    communicationStyle: string;
    keywords: string;
    avoid: string;
    specific: string;
    creationNotes: string;
    clientNotes: string;
  };
  references: ContextAsset[];
  priorityReferences: ContextAsset[];
  approvedArt: ContextAsset[];
  productPhotos: ContextAsset[];
  materials: ContextAsset[];
  products: string;
  services: string;
  history: Content[];
  brief: string;
};
export function buildBrandContext(
  brand: Brand,
  assets: Asset[],
  history: Content[],
  brief: string,
): BrandContext {
  const brand_id = requireBrandId(brand?.id);
  const own: ContextAsset[] = assets
    .filter((a) => a.brandId === brand_id)
    .map((a) => {
      const category = canonicalCategory(a.category, a.approved);
      return {
        ...a,
        category,
        semanticRole: categoryInfo(category).role,
        relevance:
          (category === 'approved_art'
            ? 80
            : category === 'visual_reference'
              ? 40
              : 20) + (a.priority ? 20 : 0),
      };
    })
    .sort((a, b) => b.relevance - a.relevance);
  const group = (category: AssetCategory) =>
    own.filter((a) => a.category === category);
  const references = own.filter((a) =>
    ['visual_reference', 'approved_art'].includes(a.category),
  );
  return {
    brand_id,
    brand,
    identity: {
      brandbooks: group('brandbook'),
      logos: group('logo'),
      palette: brand.colors,
      fonts: brand.fonts,
    },
    rules: {
      voice: brand.voice,
      visualDirection: brand.direction,
      communicationStyle: brand.communicationStyle || '',
      keywords: brand.keywords,
      avoid: brand.forbidden,
      specific: brand.rules || '',
      creationNotes: brand.creationNotes || '',
      clientNotes: brand.notes,
    },
    references,
    priorityReferences: own.filter((a) => a.priority),
    approvedArt: group('approved_art'),
    productPhotos: group('product_photo'),
    materials: group('material'),
    products: brand.products,
    services: brand.services,
    history: history
      .filter((c) => c.brandId === brand_id)
      .sort((a, b) => b.date.localeCompare(a.date)),
    brief,
  };
}
