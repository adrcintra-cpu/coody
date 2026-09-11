import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBrandContext,
  identityCompleteness,
  canonicalCategory,
} from '../lib/brand-memory.ts';
const brand = {
  id: 'a',
  colors: '#fff',
  fonts: 'Saira',
  voice: 'Direto',
  notes: 'Cliente',
  rules: 'Preservar logo',
};
const asset = (id, brandId, category, priority = 0) => ({
  id,
  brandId,
  category,
  priority,
  approved: 0,
});
test('Contexto separa identidade oficial, inspiração e histórico da marca', () => {
  const assets = [
    asset('logo', 'a', 'logo'),
    asset('ref', 'a', 'visual_reference'),
    asset('priority', 'a', 'visual_reference', 1),
    asset('approved', 'a', 'approved_art'),
    asset('foreign', 'b', 'logo', 1),
  ];
  const context = buildBrandContext(
    brand,
    assets,
    [
      { brandId: 'b', date: '2030-01-01' },
      { brandId: 'a', date: '2026-01-01' },
    ],
    'Brief',
  );
  assert.equal(context.brand_id, 'a');
  assert.deepEqual(
    context.identity.logos.map((a) => a.id),
    ['logo'],
  );
  assert.deepEqual(
    context.references.map((a) => a.id),
    ['approved', 'priority', 'ref'],
  );
  assert.equal(context.history.length, 1);
  assert.equal(context.history[0].brandId, 'a');
  assert.ok(context.identity.logos[0].semanticRole.includes('preservados'));
  assert.equal(context.priorityReferences.length, 1);
});
test('Todas as marcas não é um contexto de geração', () => {
  for (const id of ['', 'all', 'Todas as marcas'])
    assert.throws(() => buildBrandContext({ ...brand, id }, [], [], ''));
});
test('Completude ignora arquivos de outras marcas e permite cadastro incompleto', () => {
  assert.equal(
    identityCompleteness(brand, [asset('logo', 'b', 'logo')]).percent,
    50,
  );
  assert.equal(
    identityCompleteness(brand, [
      asset('logo', 'a', 'logo'),
      asset('book', 'a', 'brandbook'),
      asset('ref', 'a', 'visual_reference'),
    ]).percent,
    100,
  );
});
test('Categorias antigas continuam legíveis e aprovação tem papel semântico', () => {
  assert.equal(canonicalCategory('Posts anteriores'), 'visual_reference');
  assert.equal(canonicalCategory('Logos'), 'logo');
  assert.equal(canonicalCategory('Referências visuais', 1), 'approved_art');
  assert.equal(canonicalCategory('categoria antiga'), 'material');
});
