import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePillars,
  validateHashtags,
  validateDate,
  validateMonth,
  assertTransition,
  planProposal,
  similarTopics,
  sharedAssetUrl,
  validateSharedCreation,
  assertChangesAddressed,
  approvedArtRecord,
  storyAdaptationUrl,
  storyAdaptationId,
  isStoryAdaptation,
  isRelevantSegment,
} from '../lib/domain.ts';
const brand = {
  id: 'b',
  name: 'Teste',
  voice: 'Claro',
  pillars: [
    { name: 'Produtos', percent: 30 },
    { name: 'Educação', percent: 70 },
  ],
};
const plan = {
  month: '2026-09',
  monthlyGoal: 12,
  weeklyGoal: 3,
  days: [2, 4, 6],
  selectedDates: [],
  campaign: '',
};
void test('pilares exigem total de 100 e não aceitam negativos', () => {
  validatePillars(brand.pillars);
  assert.throws(() => validatePillars([{ name: 'Teste', percent: 90 }]));
  assert.throws(() =>
    validatePillars([
      { name: 'A', percent: -10 },
      { name: 'B', percent: 110 },
    ]),
  );
});
void test('cinco hashtags únicas com acentos', () => {
  validateHashtags(['#Marca', '#Inspiração', '#Arte', '#Design', '#Futuro']);
  assert.throws(() => validateHashtags(['#A', '#B', '#C', '#D']));
  assert.throws(() => validateHashtags(['#A', '#a', '#C', '#D', '#E']));
  assert.throws(() =>
    validateHashtags(['#A', '#B', '#C', '#D', '#Com espaço']),
  );
});
void test('datas rejeitam dias inexistentes', () => {
  validateDate('2024-02-29');
  assert.throws(() => validateDate('2026-02-29'));
  assert.throws(() => validateMonth('2026-13'));
});
void test('aprovação não pode pular revisão e publicação protege estado', () => {
  assertTransition('REVISÃO', 'APROVAÇÃO');
  assertTransition('APROVADO', 'PUBLICADO');
  assert.throws(() => assertTransition('IDEIA', 'APROVADO'));
  assert.throws(() => assertTransition('PUBLICADO', 'EM CRIAÇÃO'));
});
void test('planejamento preserva quantidade, mês, dias e distribuição', () => {
  const result = planProposal(
    brand,
    { ...plan, selectedDates: ['special'] },
    [{ brandId: 'b', id: 'special', name: 'Data própria', date: '2026-09-14' }],
    [],
  );
  assert.equal(result.length, 12);
  assert.equal(result.filter((c) => c.pillar === 'Produtos').length, 4);
  assert.equal(result.filter((c) => c.pillar === 'Educação').length, 8);
  assert.ok(result.some((c) => c.date === '2026-09-14'));
  assert.ok(result.every((c) => c.date.startsWith('2026-09')));
  assert.ok(
    result
      .filter((c) => c.title !== 'Data própria')
      .every((c) =>
        plan.days.includes(new Date(c.date + 'T12:00:00').getDay()),
      ),
  );
});
void test('planejamento rejeita frequência vazia e limites inválidos', () => {
  assert.throws(() => planProposal(brand, { ...plan, days: [] }, [], []));
  assert.throws(() =>
    planProposal(brand, { ...plan, monthlyGoal: 101 }, [], []),
  );
});
void test('alerta identifica tema semelhante sem bloquear', () => {
  assert.equal(
    similarTopics('Inovação para novos negócios', [
      { title: 'Inovação para novos negócios' },
    ]).length,
    1,
  );
  assert.equal(
    similarTopics('Paisagismo residencial', [
      { title: 'Transformação digital' },
    ]).length,
    0,
  );
});

void test('planejamento completa a meta sem duplicar conteúdos existentes', () => {
  const existing = Array.from({ length: 4 }, (_, i) => ({
    id: String(i),
    brandId: 'b',
    date: '2026-09-08',
    pillar: 'Produtos',
    title: 'Pauta antiga',
  }));
  const result = planProposal(brand, plan, [], existing);
  assert.equal(result.length, 8);
  assert.equal(result.filter((c) => c.pillar === 'Produtos').length, 0);
  assert.ok(result.every((c) => c.date !== '2026-09-08'));
});

void test('datas privadas não entram no planejamento de outra marca', () => {
  const own = { id: 'own', brandId: 'b', name: 'Privada', date: '2026-09-14' };
  const foreign = {
    id: 'foreign',
    brandId: 'other',
    name: 'Outro cliente',
    date: '2026-09-14',
  };
  const global = {
    id: 'global',
    isGlobal: 1,
    name: 'Global',
    date: '2026-09-14',
  };
  assert.throws(() =>
    planProposal(brand, { ...plan, selectedDates: ['foreign'] }, [foreign], []),
  );
  assert.equal(
    planProposal(brand, { ...plan, selectedDates: ['own'] }, [own], [])[0]
      .brandId,
    'b',
  );
  assert.ok(
    planProposal(
      brand,
      { ...plan, selectedDates: ['global'] },
      [global],
      [],
    ).some((c) => c.title === 'Global'),
  );
});

void test('Post e Story compartilham uma única criação visual', () => {
  assert.equal(sharedAssetUrl('/arte.png', '/arte.png'), '/arte.png');
  assert.equal(sharedAssetUrl('/arte.png', ''), '/arte.png');
  assert.throws(() => sharedAssetUrl('/feed.png', '/story.png'));
  assert.equal(
    validateSharedCreation('Feed + Story', '/arte.png', '/arte.png'),
    '/arte.png',
  );
  assert.throws(() =>
    validateSharedCreation('Feed + Story', '/feed.png', '/story.png'),
  );
});

void test('Alteração solicitada exige nova versão antes da revisão', () => {
  assert.throws(
    () => assertChangesAddressed('REVISÃO', 'v3', 'v3'),
    /nova versão/,
  );
  assert.throws(() => assertChangesAddressed('APROVAÇÃO', 'v3', 'v3'));
  assertChangesAddressed('REVISÃO', 'v4', 'v3');
  assertChangesAddressed('REVISÃO', 'v1', undefined);
  assertChangesAddressed('EM CRIAÇÃO', 'v3', 'v3');
});

void test('Aprovação cria registro de arte aprovada sem alterar o original', () => {
  const source = {
    id: 'a1',
    brandId: 'b',
    name: 'xicara.png',
    category: 'product_photo',
    mime: 'image/png',
    url: '/api/assets/a1',
    description: 'Foto do produto',
    aiNotes: '',
    priority: 0,
    approved: 0,
    createdAt: '2026-09-30T00:00:00Z',
    updatedAt: '2026-09-30T00:00:00Z',
  };
  const assets = [source];
  const input = {
    brandId: 'b',
    url: '/api/assets/a1',
    title: 'Pauta',
    versionNumber: 3,
    id: 'novo',
    now: '2026-10-01T00:00:00Z',
  };
  const record = approvedArtRecord(assets, input);
  assert.equal(record.id, 'novo');
  assert.equal(record.category, 'approved_art');
  assert.equal(record.url, source.url);
  assert.equal(record.approved, 1);
  assert.equal(source.category, 'product_photo');
  assert.equal(source.priority, 0);
  assert.equal(
    approvedArtRecord([...assets, { ...record }], { ...input, id: 'x' }),
    null,
  );
  assert.equal(approvedArtRecord(assets, { ...input, brandId: 'outra' }), null);
  assert.equal(approvedArtRecord(assets, { ...input, url: '' }), null);
});

void test('Story é sempre a adaptação derivada da arte do Feed', () => {
  assert.equal(storyAdaptationUrl('/api/assets/abc-1'), '/api/assets/story-abc-1');
  assert.equal(storyAdaptationId('/api/assets/abc-1'), 'story-abc-1');
  assert.equal(storyAdaptationUrl('/api/assets/story-abc-1'), '');
  assert.equal(storyAdaptationUrl('https://outro.site/x.png'), '');
  assert.equal(storyAdaptationUrl(''), '');
  assert.ok(isStoryAdaptation({ id: 'story-abc' }));
  assert.ok(!isStoryAdaptation({ id: 'abc' }));
  assert.equal(
    sharedAssetUrl('/api/assets/abc', '/api/assets/story-abc'),
    '/api/assets/abc',
  );
  assert.throws(() => sharedAssetUrl('/api/assets/abc', '/api/assets/story-xyz'));
  assert.throws(() => sharedAssetUrl('/api/assets/abc', '/api/assets/xyz'));
});

void test('relevância de datas compara palavras do segmento', () => {
  assert.ok(isRelevantSegment(['Cafeteria'], 'Cafeteria artesanal — teste'));
  assert.ok(isRelevantSegment(['Café'], 'cafe especial'));
  assert.ok(!isRelevantSegment(['Tecnologia', 'Comercial'], 'Cafeteria artesanal'));
  assert.ok(!isRelevantSegment(['Cafeteria'], ''));
  assert.ok(isRelevantSegment('Tecnologia, Cafeteria', 'Cafeteria artesanal'));
  assert.ok(!isRelevantSegment('Tecnologia, Comercial', 'Cafeteria artesanal'));
});

void test('Story recomposto: pedido preserva a mesma criação e marca o arquivo', async () => {
  const { storyRecomposePrompt, isRecomposedStory, STORY_AI_MARKER, STORY_SIZE } =
    await import('../lib/story-recompose.ts');
  const prompt = storyRecomposePrompt({
    headline: 'Seu primeiro gole de outubro',
    copy: 'Café coado da casa, feito na hora.',
    brandName: 'Aurora Café',
    colors: '#123B32, #F7E9D0',
    fonts: 'Montserrat',
  });
  assert.ok(prompt.includes('"Seu primeiro gole de outubro"'));
  assert.ok(prompt.includes('"Café coado da casa, feito na hora."'));
  assert.ok(prompt.includes('9:16'));
  assert.ok(/mesma imagem principal/.test(prompt));
  assert.ok(/sem faixas, molduras, bordas desfocadas/.test(prompt));
  assert.equal(STORY_SIZE, '1152x2048');
  assert.ok(
    isRecomposedStory({ id: 'story-abc', description: STORY_AI_MARKER + ' a partir de "x".' }),
  );
  // Old blurred previews are never treated as a recomposed Story.
  assert.ok(
    !isRecomposedStory({
      id: 'story-abc',
      description: 'Adaptação vertical 1080 × 1920 gerada automaticamente a partir de "x".',
    }),
  );
  assert.ok(!isRecomposedStory({ id: 'abc', description: STORY_AI_MARKER }));
});

import {
  activeState,
  trashDaysLeft,
  purgeCutoff,
  BRAND_TRASH_DAYS,
} from '../lib/brand-lifecycle.ts';
test('inactive brands and their data leave the working state', () => {
  const state = {
    brands: [
      { id: 'a', name: 'A', status: 'active' },
      { id: 'i', name: 'I', status: 'inactive' },
      { id: 'legacy', name: 'L' },
    ],
    contents: [
      { id: 'ca', brandId: 'a' },
      { id: 'ci', brandId: 'i' },
    ],
    versions: [
      { id: 'va', contentId: 'ca' },
      { id: 'vi', contentId: 'ci' },
    ],
    comments: [{ id: 'mi', contentId: 'ci' }],
    assets: [
      { id: 'fa', brandId: 'a' },
      { id: 'fi', brandId: 'i' },
    ],
    storyAssets: [{ id: 'story-fi', brandId: 'i' }],
    plans: [{ id: 'pi', brandId: 'i' }],
    dates: [
      { id: 'g', isGlobal: 1, brandId: null },
      { id: 'di', isGlobal: 0, brandId: 'i' },
      { id: 'free', isGlobal: 0, brandId: null },
    ],
  };
  const v = activeState(state);
  assert.deepEqual(v.brands.map((b) => b.id), ['a', 'legacy']);
  assert.deepEqual(v.contents.map((c) => c.id), ['ca']);
  assert.deepEqual(v.versions.map((c) => c.id), ['va']);
  assert.equal(v.comments.length, 0);
  assert.deepEqual(v.assets.map((c) => c.id), ['fa']);
  assert.equal(v.storyAssets.length, 0);
  assert.equal(v.plans.length, 0);
  assert.deepEqual(v.dates.map((d) => d.id), ['g', 'free']);
  // Nothing inactive: the same object is returned.
  const none = { ...state, brands: [state.brands[0]] };
  assert.equal(activeState(none), none);
});
test('brand trash keeps 30 days and then purges', () => {
  const now = Date.parse('2026-10-01T12:00:00Z');
  assert.equal(BRAND_TRASH_DAYS, 30);
  assert.equal(trashDaysLeft('2026-10-01T12:00:00Z', now), 30);
  assert.equal(trashDaysLeft('2026-09-01T13:00:00Z', now), 1);
  assert.equal(trashDaysLeft('2026-08-01T00:00:00Z', now), 0);
  assert.equal(trashDaysLeft('inválida', now), 0);
  const cutoff = purgeCutoff(now);
  assert.equal(cutoff, '2026-09-01T12:00:00.000Z');
  assert.ok('2026-08-31T23:59:59.000Z' < cutoff);
  assert.ok(!('2026-09-02T00:00:00.000Z' < cutoff));
});

import {
  normalizePillars,
  parseSuggestion,
  mergeSuggestion,
  publicSiteUrl,
  siteText,
} from '../lib/brand-assist.ts';
test('brand assist: pillars always add up to 100', () => {
  const p = normalizePillars([
    { name: 'Produtos', percent: 40 },
    { name: 'Dicas', percent: 40 },
    { name: 'Bastidores', percent: 40 },
    { name: 'dicas', percent: 10 },
    { name: '', percent: 10 },
  ]);
  assert.equal(p.length, 3);
  assert.equal(p.reduce((n, x) => n + x.percent, 0), 100);
  assert.deepEqual(normalizePillars('x'), []);
});
test('brand assist fills only empty fields and keeps user choices', () => {
  const defaults = { pillars: [{ name: 'A', percent: 100 }], monthlyGoal: 12, weeklyGoal: 3 };
  const brand = {
    name: 'Café', segment: 'Cafeteria', description: 'Minha descrição', voice: '',
    products: '', services: '', communicationStyle: '', keywords: '', forbidden: '',
    direction: '', rules: '', creationNotes: '', colors: '#111111', fonts: '',
    pillars: defaults.pillars, monthlyGoal: 12, weeklyGoal: 3,
  };
  const suggestion = parseSuggestion({
    description: 'Outra', voice: 'Acolhedor', colors: '#FFFFFF', products: '',
    pillars: [{ name: 'X', percent: 60 }, { name: 'Y', percent: 40 }],
    monthlyGoal: 16, weeklyGoal: 99, review: 'Confirme as cores.',
  });
  assert.equal(suggestion.weeklyGoal, 3); // out of range → default
  const { brand: next, filled } = mergeSuggestion(brand, suggestion, defaults);
  assert.equal(next.description, 'Minha descrição');
  assert.equal(next.colors, '#111111');
  assert.equal(next.voice, 'Acolhedor');
  assert.deepEqual(next.pillars.map((p) => p.name), ['X', 'Y']);
  assert.equal(next.monthlyGoal, 16);
  assert.ok(filled.includes('Tom de voz') && !filled.includes('Descrição'));
  // Pillars already edited by the user are kept.
  const edited = { ...brand, pillars: [{ name: 'Meu', percent: 100 }] };
  assert.deepEqual(mergeSuggestion(edited, suggestion, defaults).brand.pillars, edited.pillars);
});
test('brand assist reads only public sites', () => {
  assert.equal(publicSiteUrl('auroracafe.com.br'), 'https://auroracafe.com.br/');
  assert.equal(publicSiteUrl('http://site.com/sobre#x'), 'http://site.com/sobre');
  for (const bad of ['http://localhost:3000', 'http://127.0.0.1', 'http://10.0.0.5/', 'ftp://site.com', 'https://user:pw@site.com', 'https://site.com:8080', 'http://[::1]/', 'intranet', 'http://printer.local'])
    assert.equal(publicSiteUrl(bad), '', bad);
  const text = siteText('<html><head><title>Aurora &amp; Café</title><meta name="description" content="Cafés especiais"><style>.a{color:#ff0000}</style><script>alert(1)</script></head><body style="background:#1A1A1A"><h1>Grãos</h1><p>Torra média</p></body></html>');
  assert.match(text, /Título: Aurora & Café/);
  assert.match(text, /Descrição: Cafés especiais/);
  assert.match(text, /#1A1A1A/);
  assert.ok(!text.includes('alert'));
});

import { validSlackWebhook, maskWebhook, parseEvents, slackMessage } from '../lib/slack.ts';
test('slack: only incoming webhooks, events and message', () => {
  const ok = 'https://hooks.slack.com/services/T000/B000/abcDEF123';
  assert.equal(validSlackWebhook(' ' + ok + ' '), ok);
  for (const bad of ['http://hooks.slack.com/services/T/B/x', 'https://evil.com/services/T/B/x', 'https://hooks.slack.com/services/T/B', ok + '?x=1'])
    assert.equal(validSlackWebhook(bad), '', bad);
  assert.equal(maskWebhook(ok), 'https://hooks.slack.com/services/…F123');
  assert.deepEqual(parseEvents('["APROVADO","x","comment"]'), ['APROVADO', 'comment']);
  assert.deepEqual(parseEvents('lixo'), []);
  const m = slackMessage({ event: 'ALTERAÇÃO', title: 'Lançamento <café>', brand: 'Aurora', date: '2026-10-20', user: 'André', link: 'https://x.app/#Studio?id=1', comment: 'Trocar a foto\nmais clara' });
  assert.match(m.text, /\*Em alteração\* · Aurora/);
  assert.match(m.text, /<https:\/\/x\.app\/#Studio\?id=1\|Lançamento &lt;café&gt;> · publicação em 20\/10\/2026/);
  assert.match(m.text, /> Trocar a foto\n> mais clara/);
});

import {
  validateAttachments,
  pieceMaterials,
  MAX_ATTACHMENTS,
} from '../lib/creative-materials.ts';
const lib = [
  { id: 'logo', brandId: 'b', category: 'logo', mime: 'image/png', name: 'Logo principal', aiNotes: '', approved: 0, priority: 0 },
  { id: 'manual', brandId: 'b', category: 'brandbook', mime: 'application/pdf', name: 'Manual', aiNotes: '', approved: 0, priority: 0 },
  { id: 'p1', brandId: 'b', category: 'product_photo', mime: 'image/jpeg', name: 'Café Bourbon', aiNotes: '', approved: 0, priority: 0 },
  { id: 'p2', brandId: 'b', category: 'product_photo', mime: 'image/png', name: 'Café Gourmet', aiNotes: '', approved: 0, priority: 0 },
  { id: 'ref', brandId: 'b', category: 'visual_reference', mime: 'image/png', name: 'Ref', aiNotes: '', approved: 0, priority: 0 },
  { id: 'other', brandId: 'x', category: 'product_photo', mime: 'image/png', name: 'Outra marca', aiNotes: '', approved: 0, priority: 0 },
  { id: 'story-p1', brandId: 'b', category: 'material', mime: 'image/png', name: 'Story', aiNotes: '', approved: 0, priority: 0 },
];
test('attachments: only images of the brand, unique, limited', () => {
  assert.deepEqual(validateAttachments(['p1', 'p1', 'p2'], 'b', lib), ['p1', 'p2']);
  assert.deepEqual(validateAttachments(undefined, 'b', lib), []);
  assert.throws(() => validateAttachments(['other'], 'b', lib), /desta marca/);
  assert.throws(() => validateAttachments(['manual'], 'b', lib), /desta marca/);
  assert.throws(() => validateAttachments(['story-p1'], 'b', lib), /desta marca/);
  assert.throws(() => validateAttachments('p1', 'b', lib), /inválidos/);
  const many = Array.from({ length: MAX_ATTACHMENTS + 1 }, (_, i) => 'p' + i);
  assert.throws(() => validateAttachments(many, 'b', lib), /até/);
});
test('generation sends identity plus only the attached products', () => {
  const { materials, attached } = pieceMaterials('b', lib, ['p1']);
  assert.deepEqual(attached.map((a) => a.id), ['p1']);
  assert.deepEqual(materials.map((a) => a.id).sort(), ['logo', 'manual', 'p1']);
  // Without attachments: the whole brand library, as before.
  const all = pieceMaterials('b', lib, []).materials.map((a) => a.id);
  assert.ok(all.includes('p2') && all.includes('ref') && !all.includes('other'));
  // Stale ids are ignored.
  assert.equal(pieceMaterials('b', lib, ['gone']).attached.length, 0);
});
