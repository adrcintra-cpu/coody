import { fetch, ensureTestBrand } from './local-client.mjs';
await ensureTestBrand();
// Run against the isolated local demo. Creates a QA brand; clean up only that brand after running.
import assert from 'node:assert/strict';
const origin = 'http://localhost:3000';
async function post(action, data, expected = 200) {
  const response = await fetch(origin + '/api/workspace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ action, data }),
  });
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return result;
}
async function state() {
  const response = await fetch(origin + '/api/workspace');
  assert.equal(response.status, 200);
  return response.json();
}
const initial = await state();
assert.ok(initial.brands.length > 0);
const source = initial.brands[0];
const qa = await post('saveBrand', {
  ...source,
  id: '',
  name: 'QA COODY ' + Date.now(),
});
const brandId = qa.id;
await post(
  'saveBrand',
  {
    ...source,
    id: brandId,
    name: 'Invalid',
    pillars: [{ name: 'Only', percent: 50 }],
  },
  400,
);
const c = await post('createContent', {
  brandId,
  title: 'Teste de fluxo',
  brief: 'Teste local',
  objective: 'Validação',
  pillar: source.pillars[0].name,
  date: '2030-01-15',
  format: 'Feed + Story',
});
await post('status', { id: c.id, status: 'APROVADO' }, 400);
await post('status', { id: c.id, status: 'EM CRIAÇÃO' });
const version = {
  id: c.id,
  headline: 'Teste',
  copy: 'Apoio',
  caption: 'Legenda de teste',
  hashtags: ['#A', '#B', '#C', '#D', '#E'],
  feedUrl: '',
  storyUrl: '',
};
await post('saveVersion', { ...version, hashtags: ['#A'] }, 400);
await post('saveVersion', version);
await post('status', { id: c.id, status: 'REVISÃO' });
await post('status', { id: c.id, status: 'APROVAÇÃO' }, 400);
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG2cAAAAASUVORK5CYII=',
  'base64',
);
async function upload(name) {
  const f = new FormData();
  f.set('brandId', brandId);
  f.set('category', 'Referências visuais');
  f.set('file', new Blob([png], { type: 'image/png' }), name);
  const r = await fetch(origin + '/api/assets', {
    method: 'POST',
    headers: { Origin: origin },
    body: f,
  });
  const body = await r.json();
  assert.equal(r.status, 200, JSON.stringify(body));
  const asset = await fetch(origin + '/api/assets/' + body.id);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('content-type'), 'image/png');
  return '/api/assets/' + body.id;
}
const feedUrl = await upload('qa-feed.png'),
  storyUrl = await upload('qa-story.png');
await post('saveVersion', { ...version, feedUrl, storyUrl });
await post('status', { id: c.id, status: 'APROVAÇÃO' });
await post('saveVersion', { ...version, feedUrl, storyUrl }, 400);
await post('status', { id: c.id, status: 'ALTERAÇÃO' }, 400);
await post('status', {
  id: c.id,
  status: 'ALTERAÇÃO',
  comment: 'Ajustar a mensagem.',
});
await post('saveVersion', {
  ...version,
  feedUrl,
  storyUrl,
  headline: 'Mensagem revisada',
});
await post('status', { id: c.id, status: 'REVISÃO' });
await post('status', { id: c.id, status: 'APROVAÇÃO' });
await post('status', { id: c.id, status: 'APROVADO', addReference: true });
await post('saveVersion', { ...version, feedUrl, storyUrl }, 400);
await post('status', { id: c.id, status: 'PUBLICADO' });
await post('deleteContent', { id: c.id }, 400);
const final = await state();
assert.equal(final.contents.find((x) => x.id === c.id).status, 'PUBLICADO');
const versions = final.versions.filter((v) => v.contentId === c.id);
assert.equal(versions.length, 4);
assert.equal(versions.filter((v) => v.locked).length, 1);
assert.equal(
  final.assets.filter((a) => a.brandId === brandId && a.approved).length,
  2,
);
assert.equal(final.comments.filter((x) => x.contentId === c.id).length, 1);
await post('savePlan', {
  brandId,
  month: '2030-02',
  monthlyGoal: 3,
  weeklyGoal: 1,
  days: [2],
  campaign: 'Teste',
  selectedDates: [],
});
await post(
  'savePlan',
  {
    brandId,
    month: '2030-02',
    monthlyGoal: 3,
    weeklyGoal: 1,
    days: [2],
    campaign: 'Teste',
    selectedDates: [],
  },
  400,
);
const refreshed = await state();
assert.equal(
  refreshed.contents.filter(
    (x) => x.brandId === brandId && x.date.startsWith('2030-02'),
  ).length,
  3,
);
console.log(JSON.stringify({ passed: true, checks: 24, qaBrandId: brandId }));
