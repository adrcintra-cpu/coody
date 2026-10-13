import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDNA, genericRule, genericElements, parseLines, validateLines,
  parseReferenceMeta, parseConcepts, conceptBrief, parseValidation, dnaFilled,
} from '../lib/art-direction.ts';

test('DNA: só campos conhecidos, níveis e recursos válidos', () => {
  const dna = parseDNA(JSON.stringify({ positioning: '  Café de origem  ', hack: 'x', sophistication: 'Sofisticado', allowedGeneric: ['Robôs', 'Inventado'] }));
  assert.equal(dna.positioning, 'Café de origem');
  assert.equal(dna.sophistication, 'Sofisticado');
  assert.deepEqual(dna.allowedGeneric, ['Robôs']);
  assert.equal('hack' in dna, false);
  assert.equal(parseDNA('não é json').positioning, '');
  assert.equal(parseDNA({ sophistication: 'Ultra' }).sophistication, '');
  assert.equal(dnaFilled(dna), 2);
});

test('regra contra estilo genérico respeita o DNA', () => {
  const rule = genericRule(parseDNA({ allowedGeneric: ['Efeitos neon'] }));
  assert.ok(rule.includes('Hologramas'));
  assert.ok(!rule.split('Fazem parte do DNA')[0].includes('Efeitos neon'));
  assert.ok(rule.includes('podem ser usados') && rule.includes('Efeitos neon'));
  assert.ok(genericRule(parseDNA({})).includes(genericElements.join(', ')));
});

test('linhas criativas: nomes obrigatórios e únicos', () => {
  assert.deepEqual(parseLines('[{"id":"a","name":"Editorial","description":"d"},{"id":"a","name":"Dup"}]').map((l) => l.name), ['Editorial']);
  assert.throws(() => validateLines([{ id: 'a', name: '' }]), /nome/);
  assert.throws(() => validateLines([{ id: 'a', name: 'X' }, { id: 'b', name: 'x' }]), /mesmo nome/);
  assert.equal(validateLines([{ id: 'a', name: 'X', description: 'y' }]).length, 1);
});

test('ficha da referência: status padrão aprovada', () => {
  const m = parseReferenceMeta({ campaign: 'Natal', status: 'xx' });
  assert.equal(m.status, 'aprovada');
  assert.equal(m.campaign, 'Natal');
  assert.equal(parseReferenceMeta({ status: 'não usar' }).status, 'não usar');
});

const concept = (kind) => ({
  kind, name: 'C ' + kind, rationale: 'r', imageDescription: 'img',
  direction: { conceitoCentral: 'ideia', protagonista: 'p', estilo: '', composicao: '', perspectiva: '', enquadramento: '', iluminacao: '', materiais: '', paleta: '', tipografia: '', hierarquia: '' },
  referencesUsed: ['Ref A'], preserved: ['logo'],
});
test('conceitos: três, na ordem Seguro/Autoral/Experimental', () => {
  const out = parseConcepts(JSON.stringify({ leitura: { mensagem: 'm' }, conceitos: [concept('Experimental'), concept('Seguro'), concept('Autoral')] }));
  assert.deepEqual(out.concepts.map((c) => c.kind), ['Seguro', 'Autoral', 'Experimental']);
  assert.equal(out.reading.mensagem, 'm');
  assert.throws(() => parseConcepts({ conceitos: [concept('Seguro')] }), /três conceitos/);
  const brief = conceptBrief(out.concepts[0]);
  assert.ok(brief.includes('Conceito central: ideia') && brief.includes('Preservar da identidade: logo') && !brief.includes('Estilo visual:'));
});

test('validação: nota limitada a 0–100', () => {
  assert.equal(parseValidation({ nota: 140, cliches: ['neon'] }).nota, 100);
  assert.throws(() => parseValidation({ nota: 'x' }), /nota/);
});
