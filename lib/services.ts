import type { Content, Version } from './types';
import type { BrandContext } from './brand-memory';
export { buildBrandContext } from './brand-memory';
export type { BrandContext } from './brand-memory';
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
