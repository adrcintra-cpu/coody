/**
 * Direção de arte por marca: DNA criativo, linhas criativas, ficha das
 * referências, conceitos do agente diretor de arte e validação da arte.
 * Pure (no I/O), tested in Node.
 */

/* ---------------- DNA criativo ---------------- */

/** Recursos visuais "genéricos de IA". Só entram quando fazem parte do DNA
 *  do cliente (marcados aqui) ou quando o conceito os justifica. */
export const genericElements = [
  'Ícones 3D flutuantes',
  'Dashboards e gráficos',
  'Hologramas',
  'Circuitos eletrônicos',
  'Cérebros digitais',
  'Robôs',
  'Cartões de vidro translúcido',
  'Efeitos neon',
  'Partículas luminosas',
  'Gradientes tecnológicos',
  'Notebooks e smartphones como protagonistas',
  'Elementos decorativos sem função conceitual',
] as const;

export const sophisticationLevels = [
  'Popular e direto',
  'Equilibrado',
  'Sofisticado',
  'Premium / luxo',
] as const;

export type ArtDNA = {
  // Identidade visual (cores e fontes ficam na aba Identidade da marca)
  logoVariations: string;
  secondaryTypography: string;
  graphicElements: string;
  textures: string;
  photoStyle: string;
  illustrationStyle: string;
  // Personalidade criativa
  positioning: string;
  sophistication: string;
  advertisingLanguage: string;
  recognizable: string;
  forbiddenVisuals: string;
  /** Recursos genéricos que fazem parte da identidade deste cliente. */
  allowedGeneric: string[];
};
export const dnaFields: { key: Exclude<keyof ArtDNA, 'allowedGeneric' | 'sophistication'>; label: string; hint: string; group: 'identidade' | 'personalidade' }[] = [
  { key: 'logoVariations', label: 'Logotipo e variações', hint: 'Versões do logo e quando usar cada uma (horizontal, símbolo, monocromático…).', group: 'identidade' },
  { key: 'secondaryTypography', label: 'Tipografia principal e secundária', hint: 'Como as fontes se combinam: títulos, apoio, pesos, caixa alta…', group: 'identidade' },
  { key: 'graphicElements', label: 'Elementos gráficos proprietários', hint: 'Grafismos, formas, molduras, ícones ou padrões próprios da marca.', group: 'identidade' },
  { key: 'textures', label: 'Texturas, materiais e acabamentos', hint: 'Papel, madeira, metal, tecido, fosco, brilho…', group: 'identidade' },
  { key: 'photoStyle', label: 'Estilo fotográfico', hint: 'Luz, enquadramento, cenários, pessoas, tratamento de cor.', group: 'identidade' },
  { key: 'illustrationStyle', label: 'Estilo de ilustração / 3D', hint: 'Se a marca usa ilustração ou 3D: traço, volumes, personagens, cenários.', group: 'identidade' },
  { key: 'positioning', label: 'Posicionamento da marca', hint: 'Para quem é, contra o que se diferencia, que lugar quer ocupar.', group: 'personalidade' },
  { key: 'advertisingLanguage', label: 'Linguagem publicitária', hint: 'Como a marca costuma comunicar: humor, emoção, prova, manifesto, oferta…', group: 'personalidade' },
  { key: 'recognizable', label: 'O que torna a marca reconhecível', hint: 'O que alguém reconhece sem ver o logo.', group: 'personalidade' },
  { key: 'forbiddenVisuals', label: 'Elementos visuais proibidos ou indesejados', hint: 'O que nunca deve aparecer nas peças.', group: 'personalidade' },
];
export const emptyDNA = (): ArtDNA => ({
  logoVariations: '',
  secondaryTypography: '',
  graphicElements: '',
  textures: '',
  photoStyle: '',
  illustrationStyle: '',
  positioning: '',
  sophistication: '',
  advertisingLanguage: '',
  recognizable: '',
  forbiddenVisuals: '',
  allowedGeneric: [],
});
const text = (v: unknown, max = 3000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
function parseJSON(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
/** Reads a DNA from the database or a request, keeping only known fields. */
export function parseDNA(value: unknown): ArtDNA {
  const v = (parseJSON(value) || {}) as Record<string, unknown>;
  const dna = emptyDNA();
  for (const f of dnaFields) dna[f.key] = text(v[f.key]);
  dna.sophistication = (sophisticationLevels as readonly string[]).includes(v.sophistication as string)
    ? (v.sophistication as string)
    : '';
  dna.allowedGeneric = Array.isArray(v.allowedGeneric)
    ? (genericElements as readonly string[]).filter((g) => (v.allowedGeneric as unknown[]).includes(g))
    : [];
  return dna;
}
export function dnaFilled(dna: ArtDNA) {
  return dnaFields.filter((f) => dna[f.key]).length + (dna.sophistication ? 1 : 0);
}

/* ---------------- Linhas criativas ---------------- */

export type CreativeLine = { id: string; name: string; description: string };
export const lineSuggestions: Omit<CreativeLine, 'id'>[] = [
  { name: 'Editorial', description: 'Tipografia expressiva, composições minimalistas, espaços negativos e objetos conceituais.' },
  { name: 'Fotografia publicitária', description: 'Cenas hiper-realistas, iluminação profissional, composição cinematográfica e produtos fiéis às referências.' },
  { name: 'Ilustração 3D proprietária', description: 'Personagens, objetos e cenários com as características visuais específicas da marca.' },
  { name: 'Institucional premium', description: 'Comunicação sofisticada, hierarquia clara e forte consistência de identidade.' },
  { name: 'Conceitual', description: 'Metáforas visuais inesperadas, objetos simbólicos e soluções criativas de alto impacto.' },
  { name: 'Produto', description: 'Destaque para o produto real, preservando características, proporções, cores e detalhes.' },
];
export const MAX_LINES = 12;
export function parseLines(value: unknown): CreativeLine[] {
  const list = parseJSON(value);
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  return list
    .map((l) => l as Record<string, unknown>)
    .filter((l) => l && typeof l.id === 'string' && /^[\w-]{1,64}$/.test(l.id as string))
    .map((l) => ({ id: l.id as string, name: text(l.name, 80), description: text(l.description, 1500) }))
    .filter((l) => l.name && !seen.has(l.id) && seen.add(l.id))
    .slice(0, MAX_LINES);
}
/** Validates lines sent by the editor (names required, unique, limited). */
export function validateLines(value: unknown): CreativeLine[] {
  if (!Array.isArray(value)) throw new Error('Linhas criativas inválidas.');
  if (value.length > MAX_LINES) throw new Error(`Use no máximo ${MAX_LINES} linhas criativas.`);
  const lines = parseLines(value);
  if (lines.length !== value.length) throw new Error('Dê um nome a cada linha criativa.');
  const names = new Set(lines.map((l) => l.name.toLocaleLowerCase('pt-BR')));
  if (names.size !== lines.length) throw new Error('Há duas linhas criativas com o mesmo nome.');
  return lines;
}

/* ---------------- Ficha das referências ---------------- */

export const referenceStatuses = ['aprovada', 'em análise', 'não usar'] as const;
export type ReferenceStatus = (typeof referenceStatuses)[number];
export type ReferenceAnalysis = {
  composicao: string;
  tipografia: string;
  iluminacao: string;
  materiais: string;
  enquadramento: string;
  hierarquia: string;
  linguagem: string;
  preservar: string;
};
export const analysisLabels: Record<keyof ReferenceAnalysis, string> = {
  composicao: 'Composição',
  tipografia: 'Tipografia',
  iluminacao: 'Iluminação',
  materiais: 'Materiais e texturas',
  enquadramento: 'Enquadramento',
  hierarquia: 'Hierarquia',
  linguagem: 'Linguagem visual',
  preservar: 'O que preservar',
};
export type ReferenceMeta = {
  campaign: string;
  style: string;
  artDirection: string;
  preserve: string;
  directorNotes: string;
  status: ReferenceStatus;
  analysis?: ReferenceAnalysis | null;
  analyzedAt?: string;
};
export const referenceCategories = ['visual_reference', 'approved_art'];
export function parseReferenceMeta(value: unknown): ReferenceMeta {
  const v = (parseJSON(value) || {}) as Record<string, unknown>;
  const analysis = v.analysis && typeof v.analysis === 'object' ? parseAnalysis(v.analysis) : null;
  return {
    campaign: text(v.campaign, 120),
    style: text(v.style, 200),
    artDirection: text(v.artDirection, 2000),
    preserve: text(v.preserve, 1000),
    directorNotes: text(v.directorNotes, 2000),
    status: (referenceStatuses as readonly string[]).includes(v.status as string)
      ? (v.status as ReferenceStatus)
      : 'aprovada',
    ...(analysis ? { analysis, analyzedAt: text(v.analyzedAt, 40) } : {}),
  };
}
export function parseAnalysis(value: unknown): ReferenceAnalysis {
  const v = (parseJSON(value) || {}) as Record<string, unknown>;
  const out = {} as ReferenceAnalysis;
  for (const k of Object.keys(analysisLabels) as (keyof ReferenceAnalysis)[]) out[k] = text(v[k], 800);
  if (!Object.values(out).some(Boolean)) throw new Error('A análise da referência veio vazia.');
  return out;
}
export const analysisSchema = {
  type: 'object',
  additionalProperties: false,
  required: Object.keys(analysisLabels),
  properties: Object.fromEntries(Object.keys(analysisLabels).map((k) => [k, { type: 'string' }])),
};

/* ---------------- Conceitos do diretor de arte ---------------- */

export const conceptKinds = ['Seguro', 'Autoral', 'Experimental'] as const;
export const conceptHints: Record<(typeof conceptKinds)[number], string> = {
  Seguro: 'Consistente com o histórico e a identidade do cliente.',
  Autoral: 'Interpretação mais conceitual, sofisticada e diferenciada.',
  Experimental: 'Abordagem mais ousada, sem abandonar a identidade da marca.',
};
export const directionKeys = [
  ['conceitoCentral', 'Conceito central'],
  ['protagonista', 'Elemento protagonista'],
  ['estilo', 'Estilo visual'],
  ['composicao', 'Composição'],
  ['perspectiva', 'Perspectiva'],
  ['enquadramento', 'Enquadramento'],
  ['iluminacao', 'Iluminação'],
  ['materiais', 'Materiais e texturas'],
  ['paleta', 'Paleta'],
  ['tipografia', 'Tratamento tipográfico'],
  ['hierarquia', 'Hierarquia das informações'],
] as const;
export type DirectionKey = (typeof directionKeys)[number][0];
export type Concept = {
  kind: (typeof conceptKinds)[number];
  name: string;
  rationale: string;
  imageDescription: string;
  direction: Record<DirectionKey, string>;
  referencesUsed: string[];
  preserved: string[];
};
export type BriefReading = {
  mensagem: string;
  objetivo: string;
  publico: string;
  emocao: string;
  canal: string;
  destaque: string;
};
export const briefLabels: Record<keyof BriefReading, string> = {
  mensagem: 'Mensagem principal',
  objetivo: 'Objetivo de comunicação',
  publico: 'Público-alvo',
  emocao: 'Emoção desejada',
  canal: 'Canal e formato',
  destaque: 'Produto ou serviço em destaque',
};
const stringProps = (keys: readonly string[]) =>
  Object.fromEntries(keys.map((k) => [k, { type: 'string' }]));
export const conceptsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['leitura', 'conceitos'],
  properties: {
    leitura: {
      type: 'object',
      additionalProperties: false,
      required: Object.keys(briefLabels),
      properties: stringProps(Object.keys(briefLabels)),
    },
    conceitos: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'name', 'rationale', 'imageDescription', 'direction', 'referencesUsed', 'preserved'],
        properties: {
          kind: { type: 'string', enum: [...conceptKinds] },
          name: { type: 'string' },
          rationale: { type: 'string' },
          imageDescription: { type: 'string' },
          direction: {
            type: 'object',
            additionalProperties: false,
            required: directionKeys.map((d) => d[0]),
            properties: stringProps(directionKeys.map((d) => d[0])),
          },
          referencesUsed: { type: 'array', items: { type: 'string' } },
          preserved: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};
const list = (v: unknown, max = 12) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim().slice(0, 300)).slice(0, max) : [];
/** Reads the agent's answer: one concept of each kind, in the fixed order. */
export function parseConcepts(value: unknown): { reading: BriefReading; concepts: Concept[] } {
  const v = (parseJSON(value) || {}) as Record<string, unknown>;
  const r = (v.leitura || {}) as Record<string, unknown>;
  const reading = Object.fromEntries(Object.keys(briefLabels).map((k) => [k, text(r[k], 600)])) as BriefReading;
  const raw = Array.isArray(v.conceitos) ? (v.conceitos as Record<string, unknown>[]) : [];
  const concepts = conceptKinds.map((kind) => {
    const c = raw.find((x) => x && x.kind === kind);
    if (!c) throw new Error('O diretor de arte não devolveu os três conceitos. Tente novamente.');
    const d = (c.direction || {}) as Record<string, unknown>;
    const concept: Concept = {
      kind,
      name: text(c.name, 120),
      rationale: text(c.rationale, 1500),
      imageDescription: text(c.imageDescription, 2500),
      direction: Object.fromEntries(directionKeys.map(([k]) => [k, text(d[k], 800)])) as Concept['direction'],
      referencesUsed: list(c.referencesUsed),
      preserved: list(c.preserved),
    };
    if (!concept.name || !concept.imageDescription || !concept.direction.conceitoCentral)
      throw new Error('Um dos conceitos veio incompleto. Tente novamente.');
    return concept;
  });
  return { reading, concepts };
}

/* ---------------- Regras para os modelos ---------------- */

/** The rule against the generic AI look, with the brand's own exceptions. */
export function genericRule(dna: ArtDNA) {
  const blocked = genericElements.filter((g) => !dna.allowedGeneric.includes(g));
  return (
    'EVITE O ESTILO GENÉRICO DE IA. Não use automaticamente: ' +
    blocked.join(', ') +
    '. Esses recursos só entram se o conceito criativo justificar explicitamente sua função.' +
    (dna.allowedGeneric.length
      ? ' Fazem parte do DNA desta marca e podem ser usados, sempre com a estética, os materiais e os cenários das referências dela: ' +
        dna.allowedGeneric.join(', ') +
        '.'
      : '') +
    ' Não substitua a identidade do cliente por outra nem aplique um estilo padrão.'
  );
}
/** The concept the client approved, as text for the copy and image models. */
export function conceptBrief(c: Concept) {
  return [
    `Conceito aprovado (${c.kind}): ${c.name}`,
    'Justificativa: ' + c.rationale,
    'Imagem: ' + c.imageDescription,
    ...directionKeys.map(([k, label]) => (c.direction[k] ? `${label}: ${c.direction[k]}` : '')).filter(Boolean),
    c.preserved.length ? 'Preservar da identidade: ' + c.preserved.join('; ') : '',
    c.referencesUsed.length ? 'Referências: ' + c.referencesUsed.join('; ') : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/* ---------------- Validação da arte ---------------- */

export type ArtValidation = {
  nota: number;
  identidade: string;
  briefing: string;
  referencias: string;
  cliches: string[];
  problemas: string[];
  sugestoes: string[];
};
export const validationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['nota', 'identidade', 'briefing', 'referencias', 'cliches', 'problemas', 'sugestoes'],
  properties: {
    nota: { type: 'integer' },
    identidade: { type: 'string' },
    briefing: { type: 'string' },
    referencias: { type: 'string' },
    cliches: { type: 'array', items: { type: 'string' } },
    problemas: { type: 'array', items: { type: 'string' } },
    sugestoes: { type: 'array', items: { type: 'string' } },
  },
};
export function parseValidation(value: unknown): ArtValidation {
  const v = (parseJSON(value) || {}) as Record<string, unknown>;
  const nota = Number(v.nota);
  if (!Number.isFinite(nota)) throw new Error('A validação não devolveu uma nota.');
  return {
    nota: Math.max(0, Math.min(100, Math.round(nota))),
    identidade: text(v.identidade, 2000),
    briefing: text(v.briefing, 2000),
    referencias: text(v.referencias, 2000),
    cliches: list(v.cliches, 8),
    problemas: list(v.problemas, 8),
    sugestoes: list(v.sugestoes, 8),
  };
}
/** Reads the JSON text of a Responses API result. */
export function responseText(result: Record<string, unknown>) {
  const output = result.output as { type?: string; content?: { type?: string; text?: string }[] }[] | undefined;
  return (
    output
      ?.filter((o) => o.type === 'message')
      .flatMap((o) => o.content || [])
      .filter((c) => c.type === 'output_text')
      .map((c) => c.text || '')
      .join('') || ''
  );
}
