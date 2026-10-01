/**
 * Story recomposition: the 9:16 Story is the SAME creation as the Feed art,
 * re-laid out for 1080 × 1920 by the image model, which receives the Feed art
 * itself as input. These helpers are pure so they can be tested in Node.
 */
export const STORY_AI_MARKER = 'Recomposição 9:16 por IA';
/** Image size requested from the model (9:16). */
export const STORY_SIZE = '1152x2048';

/** A story-* library row created by the AI recomposition (not the old blurred preview). */
export function isRecomposedStory(asset: { id: string; description?: string }) {
  return (
    asset.id.startsWith('story-') &&
    (asset.description || '').startsWith(STORY_AI_MARKER)
  );
}

export function storyRecomposePrompt(input: {
  headline: string;
  copy: string;
  brandName: string;
  colors: string;
  fonts: string;
}) {
  const texts = [input.headline, input.copy].filter((t) => t.trim());
  return [
    'Você recebeu a ARTE FINAL de um post de Feed (1080 × 1350).',
    'Recomponha ESTA MESMA PEÇA no formato Story vertical 9:16 (1080 × 1920).',
    'Não crie uma nova ideia: é uma adaptação de layout da mesma criação.',
    'Preserve exatamente: a mesma imagem principal (mesma foto, mesmo produto, mesmo enquadramento do assunto), o mesmo conceito, as mesmas cores, a mesma identidade visual, os mesmos elementos gráficos e o mesmo logotipo, sem redesenhar nem substituir.',
    texts.length
      ? 'Reproduza os textos da arte com a grafia idêntica, sem traduzir, resumir ou acrescentar palavras: ' +
        texts.map((t) => JSON.stringify(t)).join(' e ') +
        '.'
      : 'Reproduza os textos da arte original com a grafia idêntica, sem acrescentar palavras.',
    'Mantenha a mesma hierarquia visual (o que é título continua título, o que é destaque continua destaque).',
    'Reorganize os elementos para o formato vertical: estenda o fundo e o cenário de forma natural e coerente com a foto original, sem faixas, molduras, bordas desfocadas ou a arte do Feed encolhida no centro.',
    'Respeite as áreas seguras do Story: deixe cerca de 250 px livres no topo e na base, sem textos ou logotipo nessas faixas.',
    'Marca: ' +
      input.brandName +
      (input.colors ? '. Cores: ' + input.colors : '') +
      (input.fonts ? '. Tipografia: ' + input.fonts : '') +
      '.',
  ].join(' ');
}
