import type { Brand, Asset, Content, Version } from './types';
export type BrandContext = {
  brand: Brand;
  references: Asset[];
  history: Content[];
  brief: string;
};
export function buildBrandContext(
  brand: Brand,
  assets: Asset[],
  history: Content[],
  brief: string,
): BrandContext {
  return {
    brand,
    references: assets
      .filter((a) => a.brandId === brand.id)
      .sort(
        (a, b) => b.approved * 2 + b.priority - (a.approved * 2 + a.priority),
      ),
    history: history.filter((c) => c.brandId === brand.id),
    brief,
  };
}
export interface OpenAIService {
  generateText(
    context: BrandContext,
  ): Promise<Pick<Version, 'headline' | 'copy' | 'caption' | 'hashtags'>>;
  generateImage(
    context: BrandContext,
    format: 'feed' | 'story',
    reference?: string,
  ): Promise<{ url: string; width: number; height: number }>;
}
export interface TrelloService {
  sendForApproval(
    content: Content,
    version: Version,
  ): Promise<{ cardId: string }>;
  handleWebhook(payload: unknown): Promise<void>;
}
export interface StorageService {
  upload(key: string, body: ArrayBuffer, mime: string): Promise<string>;
  read(key: string): Promise<{ body: ReadableStream; mime: string } | null>;
}
export const roles = {
  ADMINISTRADOR: ['planning', 'create', 'edit', 'approve', 'settings'],
  CRIATIVO: ['planning', 'create', 'edit'],
  APROVADOR: ['read', 'comment', 'approve'],
} as const;
// Real adapters run only on the server, after credentials and authentication are configured.
export class IntegrationNotConfigured extends Error {
  constructor(name: string) {
    super(`${name} será conectado na próxima etapa.`);
  }
}
