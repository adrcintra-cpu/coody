export const statuses = [
  'IDEIA',
  'PLANEJADO',
  'EM CRIAÇÃO',
  'REVISÃO',
  'APROVAÇÃO',
  'AJUSTE',
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
  AJUSTE: 'Em ajuste',
  ALTERAÇÃO: 'Em alteração',
  APROVADO: 'Aprovado',
  PUBLICADO: 'Publicado',
};
export type Brand = {
  avatarUrl?: string;
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
  /** Development hours the client contracted per month (0 = not set). */
  contractedHours?: number;
  /** 'inactive' hides the brand from every screen except Marcas. */
  status?: 'active' | 'inactive';
};
/** A brand in the trash: restorable until it is purged. */
export type DeletedBrand = {
  id: string;
  name: string;
  segment: string;
  avatarUrl?: string;
  deletedAt: string;
};
export type Content = {
  deletedAt?: string | null;
  /** Library files (product photos) attached to this piece for creation. */
  attachments?: string[];
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
  /** Files of this version beyond the single art: carousel slides, a video
   *  or an external file sent for approval. Empty for single-image pieces. */
  media?: MediaItem[];
};
export type MediaItem = { url: string; mime: string; name: string };
/** Piece formats: AI art (Feed/Story), carousel, video or an external file. */
export const formats = ['Feed + Story', 'Feed', 'Story', 'Carrossel', 'Vídeo', 'Arquivo'] as const;
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
  /** Client approval of the month plan. NULL (plans made before this
   *  existed) counts as approved. */
  approval?: PlanApproval | null;
  approvalNote?: string;
  approvedAt?: string | null;
  approvedBy?: string;
};
export type PlanApproval = 'rascunho' | 'enviado' | 'ajustes' | 'aprovado';
export const planApprovalLabels: Record<PlanApproval, string> = {
  rascunho: 'Rascunho · não enviado ao cliente',
  enviado: 'Aguardando aprovação do cliente',
  ajustes: 'Cliente pediu mudanças',
  aprovado: 'Aprovado pelo cliente',
};
export type WorkspaceInfo = {id:string;name:string;avatarUrl:string};
export type State = {
  workspace?: WorkspaceInfo;
  workspaces?: WorkspaceInfo[];
  user?: import('./identity').CurrentUser;
  brands: Brand[];
  contents: Content[];
  versions: Version[];
  assets: Asset[];
  /** Derived 1080 × 1920 Story adaptations; kept out of the Library. */
  storyAssets?: Asset[];
  comments: Comment[];
  dates: SpecialDate[];
  plans: Plan[];
  /** Brands in the trash (restorable for BRAND_TRASH_DAYS). */
  deletedBrands?: DeletedBrand[];
};
export type View =
  | 'Dashboard'
  | 'Planejamento'
  | 'Calendário'
  | 'Conteúdos'
  | 'Marcas'
  | 'Aprovações'
  | 'Produção'
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
