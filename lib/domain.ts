import type {
  Asset,
  Brand,
  Content,
  Plan,
  SpecialDate,
  Status,
} from './types';
export function validatePillars(pillars: Brand['pillars']) {
  if (
    !Array.isArray(pillars) ||
    !pillars.length ||
    pillars.some(
      (p) =>
        !p.name.trim() ||
        !Number.isFinite(p.percent) ||
        p.percent < 0 ||
        p.percent > 100,
    ) ||
    Math.abs(pillars.reduce((n, p) => n + p.percent, 0) - 100) > 0.01
  )
    throw new Error('Os percentuais dos pilares devem somar 100%.');
}
export function validateHashtags(tags: string[]) {
  if (
    !Array.isArray(tags) ||
    tags.length !== 5 ||
    tags.some((t) => !/^#[\p{L}\p{N}_]+$/u.test(t)) ||
    new Set(tags.map((t) => t.toLowerCase())).size !== 5
  )
    throw new Error('Informe exatamente 5 hashtags únicas, sem espaços.');
}
/**
 * A social piece has one visual source. Feed and Story are canvases for that
 * source, never separate creative assets. Legacy rows may have one empty URL;
 * the non-empty value is their canonical source during the migration.
 */
export function sharedAssetUrl(feedUrl: string, storyUrl: string) {
  if (feedUrl && storyUrl && feedUrl !== storyUrl)
    throw new Error('Feed e Story devem usar a mesma criação visual.');
  return feedUrl || storyUrl || '';
}
export function validateSharedCreation(
  format: string,
  feedUrl: string,
  storyUrl: string,
) {
  const asset = sharedAssetUrl(feedUrl, storyUrl);
  if (format.includes('Feed') && format.includes('Story') && asset && (!feedUrl || !storyUrl))
    throw new Error('A criação compartilhada precisa estar vinculada aos dois layouts.');
  return asset;
}
export function validateDate(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) !== value
  )
    throw new Error('Informe uma data válida.');
}
export function validateMonth(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
    throw new Error('Informe um mês válido.');
}
export const transitions: Record<Status, Status[]> = {
  IDEIA: ['PLANEJADO', 'EM CRIAÇÃO'],
  PLANEJADO: ['IDEIA', 'EM CRIAÇÃO'],
  'EM CRIAÇÃO': ['REVISÃO'],
  REVISÃO: ['EM CRIAÇÃO', 'APROVAÇÃO'],
  APROVAÇÃO: ['ALTERAÇÃO', 'APROVADO'],
  ALTERAÇÃO: ['EM CRIAÇÃO', 'REVISÃO'],
  APROVADO: ['PUBLICADO'],
  PUBLICADO: [],
};
export function assertTransition(from: Status, to: Status) {
  if (!transitions[from]?.includes(to))
    throw new Error(
      'Transição de status inválida. Siga o fluxo de revisão e aprovação.',
    );
}
/**
 * A version that received a change request cannot go back to review or
 * approval: the requested changes must arrive as a new version first.
 */
/**
 * Approving a piece promotes its art to the brand memory as a NEW library
 * record. The source file (product photo, material, reference) keeps its own
 * category, priority and description. Returns null when there is nothing to
 * promote or the art is already registered as approved for this brand.
 */
export function approvedArtRecord(
  assets: Asset[],
  input: {
    brandId: string;
    url: string;
    title: string;
    versionNumber: number;
    id: string;
    now: string;
  },
): Asset | null {
  if (!input.url) return null;
  const sameFile = assets.filter(
    (a) => a.brandId === input.brandId && a.url === input.url,
  );
  const source = sameFile[0];
  if (!source) return null;
  if (sameFile.some((a) => a.category === 'approved_art' || a.approved === 1))
    return null;
  return {
    id: input.id,
    brandId: input.brandId,
    name: ('Arte aprovada · ' + input.title).slice(0, 200),
    category: 'approved_art',
    mime: source.mime,
    url: input.url,
    description: `Versão V${input.versionNumber} aprovada. Arquivo de origem: ${source.name}.`,
    aiNotes: '',
    priority: 1,
    approved: 1,
    createdAt: input.now,
    updatedAt: input.now,
  };
}
export function assertChangesAddressed(
  to: Status,
  latestVersionId: string | undefined,
  changeRequestedVersionId: string | undefined,
) {
  if (
    ['REVISÃO', 'APROVAÇÃO'].includes(to) &&
    !!changeRequestedVersionId &&
    latestVersionId === changeRequestedVersionId
  )
    throw new Error(
      'Salve uma nova versão com as alterações solicitadas antes de voltar à revisão.',
    );
}
export function similarTopics(title: string, history: Content[]) {
  const tokens = (s: string) =>
    s
      .toLocaleLowerCase('pt-BR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/\W+/)
      .filter((x) => x.length > 3);
  const words = tokens(title);
  return history.filter((c) => {
    const prior = tokens(c.title);
    return (
      words.length > 0 &&
      words.filter((w) => prior.includes(w)).length /
        Math.max(words.length, prior.length) >=
        0.45
    );
  });
}
export function dateAvailableToBrand(date: SpecialDate, brandId: string) {
  return date.isGlobal === 1 || date.brandId === brandId;
}
export function planProposal(
  brand: Brand,
  plan: Plan,
  dates: SpecialDate[],
  existing: Content[],
): Omit<Content, 'id' | 'createdAt'>[] {
  validatePillars(brand.pillars);
  validateMonth(plan.month);
  if (
    !Number.isInteger(plan.monthlyGoal) ||
    plan.monthlyGoal < 1 ||
    plan.monthlyGoal > 100
  )
    throw new Error('Use uma meta de 1 a 100 conteúdos.');
  if (
    !Array.isArray(plan.days) ||
    !plan.days.length ||
    plan.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
  )
    throw new Error('Selecione os dias de publicação.');
  const prior = existing.filter(
    (c) => c.brandId === brand.id && c.date.startsWith(plan.month),
  );
  const count = plan.monthlyGoal - prior.length;
  if (count <= 0)
    throw new Error(
      'A meta mensal já foi atingida. Aumente a meta ou ajuste as pautas existentes.',
    );
  const candidates: string[] = [];
  const n = new Date(
    Number(plan.month.slice(0, 4)),
    Number(plan.month.slice(5)),
    0,
  ).getDate();
  for (let d = 1; d <= n; d++) {
    const date = plan.month + '-' + String(d).padStart(2, '0');
    if (plan.days.includes(new Date(date + 'T12:00:00').getDay()))
      candidates.push(date);
  }
  if (!candidates.length) throw new Error('Nenhuma data disponível.');
  if (
    plan.selectedDates.some(
      (id) =>
        !dates.some(
          (d) =>
            d.id === id &&
            dateAvailableToBrand(d, brand.id) &&
            d.date.startsWith(plan.month),
        ),
    )
  )
    throw new Error('Uma data selecionada não pertence a esta marca ou mês.');
  const chosen = dates.filter(
    (d) =>
      plan.selectedDates.includes(d.id) &&
      d.date.startsWith(plan.month) &&
      !prior.some((c) => c.date === d.date && c.title === d.name),
  );
  if (chosen.length > count)
    throw new Error('Há mais datas selecionadas que vagas na meta mensal.');
  const quotas = brand.pillars.map((p) => ({
    name: p.name,
    target: (plan.monthlyGoal * p.percent) / 100,
    used: prior.filter((c) => c.pillar === p.name).length,
  }));
  const pillars: string[] = [];
  for (let i = 0; i < count; i++) {
    const q = [...quotas].sort(
      (a, b) => b.target - b.used - (a.target - a.used),
    )[0];
    pillars.push(q.name);
    q.used++;
  }
  const occupancy = new Map<string, number>();
  for (const c of prior)
    occupancy.set(c.date, (occupancy.get(c.date) || 0) + 1);
  const result = Array.from({ length: count }, (_, i) => {
    const occasion = chosen[i];
    const pillar = pillars[i];
    const date =
      occasion?.date ||
      [...candidates].sort(
        (a, b) =>
          (occupancy.get(a) || 0) - (occupancy.get(b) || 0) ||
          a.localeCompare(b),
      )[0];
    occupancy.set(date, (occupancy.get(date) || 0) + 1);
    const title = occasion
      ? occasion.name
      : `${pillar}: ${brand.name} — pauta ${existing.length + i + 1}`;
    return {
      brandId: brand.id,
      title,
      brief:
        plan.campaign ||
        `Desenvolver pauta de ${pillar.toLowerCase()} considerando ${brand.voice}`,
      objective: 'Reconhecimento de marca',
      pillar,
      date,
      format: 'Feed + Story',
      status: 'PLANEJADO' as const,
    };
  });
  return result.sort((a, b) => a.date.localeCompare(b.date));
}
