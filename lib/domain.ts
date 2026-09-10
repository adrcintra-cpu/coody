import type { Brand, Content, Plan, SpecialDate, Status } from './types';
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
