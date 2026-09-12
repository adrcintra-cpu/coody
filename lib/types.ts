export const statuses = [
  'IDEIA',
  'PLANEJADO',
  'EM CRIAÇÃO',
  'REVISÃO',
  'APROVAÇÃO',
  'ALTERAÇÃO',
  'APROVADO',
  'PUBLICADO',
] as const;
export type Status = (typeof statuses)[number];
export const statusLabels: Record<Status, string> = {
  IDEIA: 'Ideia',
  PLANEJADO: 'Planejado',
  'EM CRIAÇÃO': 'Em criação',
  REVISÃO: 'Em revisão',
  APROVAÇÃO: 'Aguardando aprovação',
  ALTERAÇÃO: 'Em alteração',
  APROVADO: 'Aprovado',
  PUBLICADO: 'Publicado',
};
export type Brand = {
  id: string;
  name: string;
  segment: string;
  description: string;
  website: string;
  social: string;
  instagram: string;
  linkedin: string;
  communicationStyle: string;
  rules: string;
  creationNotes: string;
  voice: string;
  keywords: string;
  forbidden: string;
  direction: string;
  notes: string;
  colors: string;
  fonts: string;
  products: string;
  services: string;
  monthlyGoal: number;
  weeklyGoal: number;
  pillars: { name: string; percent: number }[];
};
export type Content = {
  id: string;
  revision?: number;
  brandId: string;
  title: string;
  brief: string;
  objective: string;
  pillar: string;
  date: string;
  format: string;
  status: Status;
  createdAt: string;
};
export type Version = {
  id: string;
  contentId: string;
  number: number;
  headline: string;
  copy: string;
  caption: string;
  hashtags: string[];
  feedUrl: string;
  storyUrl: string;
  change: string;
  createdAt: string;
  locked: number;
};
export type Asset = {
  description: string;
  aiNotes: string;
  updatedAt: string;
  id: string;
  brandId: string;
  name: string;
  category: string;
  mime: string;
  url: string;
  priority: number;
  approved: number;
  createdAt: string;
};
export type Comment = {
  id: string;
  contentId: string;
  text: string;
  createdAt: string;
  user: string;
};
export type SpecialDate = {
  id: string;
  brandId?: string | null;
  isGlobal?: number;
  name: string;
  date: string;
  segments: string;
  relevance: string;
};
export type Plan = {
  id: string;
  brandId: string;
  month: string;
  monthlyGoal: number;
  weeklyGoal: number;
  days: number[];
  campaign: string;
  selectedDates: string[];
};
export type State = {
  brands: Brand[];
  contents: Content[];
  versions: Version[];
  assets: Asset[];
  comments: Comment[];
  dates: SpecialDate[];
  plans: Plan[];
};
export type View =
  | 'Dashboard'
  | 'Planejamento'
  | 'Calendário'
  | 'Conteúdos'
  | 'Marcas'
  | 'Aprovações'
  | 'Biblioteca'
  | 'Integrações'
  | 'Configurações'
  | 'Studio';
export type Action = (
  action: string,
  data: Record<string, unknown>,
) => Promise<void>;
export const today = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
export function displayDate(value: string) {
  return new Date(value + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  });
}
