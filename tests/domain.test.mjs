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
