import type { Brand } from './types';
import { validatePillars } from './domain';
export const textValue = (v: unknown, max = 6000) =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';
export function parseBrand(
  input: Record<string, unknown>,
  id: string,
  existing?: Brand,
): Brand {
  const data = { ...existing, ...input };
  const row: Brand = {
    id,
    name: textValue(data.name, 100),
    segment: textValue(data.segment, 100),
    description: textValue(data.description),
    website: textValue(data.website, 500),
    social: textValue(data.social, 500),
    instagram: textValue(data.instagram, 500),
    linkedin: textValue(data.linkedin, 500),
    voice: textValue(data.voice),
    keywords: textValue(data.keywords),
    forbidden: textValue(data.forbidden),
    direction: textValue(data.direction),
    notes: textValue(data.notes),
    communicationStyle: textValue(data.communicationStyle),
    rules: textValue(data.rules),
    creationNotes: textValue(data.creationNotes),
    colors: textValue(data.colors, 500),
    fonts: textValue(data.fonts, 500),
    products: textValue(data.products),
    services: textValue(data.services),
    monthlyGoal: Number(data.monthlyGoal ?? 12),
    weeklyGoal: Number(data.weeklyGoal ?? 3),
    contractedHours: Number(data.contractedHours ?? 0),
    pillars: (data.pillars ?? [
      { name: 'Institucional', percent: 50 },
      { name: 'Produtos', percent: 50 },
    ]) as Brand['pillars'],
  };
  if (!row.name || !row.segment) throw new Error('Preencha nome e segmento.');
  if (
    !Number.isInteger(row.monthlyGoal) ||
    row.monthlyGoal < 1 ||
    row.monthlyGoal > 100 ||
    !Number.isInteger(row.weeklyGoal) ||
    row.weeklyGoal < 1 ||
    row.weeklyGoal > 30
  )
    throw new Error('Revise as metas mensal e semanal.');
  if (
    !Number.isFinite(row.contractedHours) ||
    row.contractedHours! < 0 ||
    row.contractedHours! > 1000
  )
    throw new Error('Revise as horas contratadas (0 a 1000 por mês).');
  row.contractedHours = Math.round(row.contractedHours! * 2) / 2;
  validatePillars(row.pillars);
  return row;
}
export function guidelineRules(brand: Brand) {
  return JSON.stringify({
    voice: brand.voice,
    direction: brand.direction,
    communicationStyle: brand.communicationStyle,
    keywords: brand.keywords,
    forbidden: brand.forbidden,
    rules: brand.rules,
    creationNotes: brand.creationNotes,
  });
}
