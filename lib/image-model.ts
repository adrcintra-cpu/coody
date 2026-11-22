import { env } from 'cloudflare:workers';

/**
 * Image models (OpenAI Images 2.6).
 * - Flare: better layout for posters and product art, used to create pieces.
 * - Sunburst: more consistent across edits, used for adjustments and the
 *   Story adaptation of an existing piece.
 * Both can be overridden by env, and fall back to gpt-image-2 when the
 * OpenAI project does not have access to 2.6 yet (see openaiRequest).
 */
const vars = env as unknown as Record<string, string | undefined>;
export const IMAGE_MODEL = vars.OPENAI_IMAGE_MODEL || 'gpt-image-2.6-flare';
export const EDIT_MODEL = vars.OPENAI_IMAGE_EDIT_MODEL || 'gpt-image-2.6-sunburst';
export const MOTION_MODEL = vars.OPENAI_MOTION_MODEL || 'gpt-image-2.6-flare';
export const FALLBACK_IMAGE_MODEL = 'gpt-image-2';
