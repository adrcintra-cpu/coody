import { fetch, ensureTestBrand } from './local-client.mjs';
await ensureTestBrand();
// Local-only regression; returns the ID of its QA brand for cleanup.
import assert from 'node:assert/strict';
const origin = 'http://localhost:3000';
async function state() {
  const r = await fetch(origin + '/api/workspace');
  assert.equal(r.status, 200);
  return r.json();
}
async function post(action, data) {
  const r = await fetch(origin + '/api/workspace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ action, data }),
  });
  return { status: r.status, body: await r.json() };
}
async function ok(action, data) {
  const r = await post(action, data);
  assert.equal(r.status, 200, JSON.stringify(r));
  return r.body;
}
const before = await state();
const brand = (
  await ok('saveBrand', {
    ...before.brands[0],
    id: '',
    name: 'QA CRITICAL ' + Date.now(),
  })
).id;
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aG2cAAAAASUVORK5CYII=',
  'base64',
);
async function upload(bytes) {
  const f = new FormData();
  f.set('brandId', brand);
  f.set('category', 'visual_reference');
  f.set('file', new Blob([bytes], { type: 'image/png' }), 'qa.png');
  const r = await fetch(origin + '/api/assets', { method: 'POST', body: f });
  return { status: r.status, body: await r.json() };
}
assert.equal((await upload(new Uint8Array([137, 80, 78, 71]))).status, 400);
const date = (
  await ok('createDate', {
    brandId: brand,
    name: 'QA Data própria',
    date: '2036-01-15',
  })
).id;
let s = await state();
assert.equal(s.dates.find((d) => d.id === date).brandId, brand);
assert.equal(s.dates.find((d) => d.id === date).isGlobal, 0);
assert.equal(
  (await post('createDate', { name: 'Sem marca', date: '2036-01-15' })).status,
  400,
);
const plan = {
  brandId: brand,
  month: '2036-01',
  monthlyGoal: 2,
  weeklyGoal: 1,
  days: [2],
  campaign: 'A',
  selectedDates: [date],
};
assert.equal(
  (await post('savePlan', { ...plan, brandId: before.brands[0].id })).status,
  400,
);
const saved = (await ok('savePlan', plan)).id;
s = await state();
const oldContents = s.contents.filter((c) => c.brandId === brand);
await ok('updatePlan', { ...plan, id: saved, monthlyGoal: 3, campaign: 'B' });
s = await state();
assert.deepEqual(
  s.contents.filter((c) => c.brandId === brand),
  oldContents,
);
assert.equal(s.plans.find((p) => p.id === saved).campaign, 'B');
for (let i = 0; i < 3; i++) {
  const asset = await upload(png);
  assert.equal(asset.status, 200);
  const id = (
    await ok('createContent', {
      brandId: brand,
      title: 'QA concorrência ' + i,
      date: '2036-02-01',
      format: 'Feed',
      pillar: before.brands[0].pillars[0].name,
    })
  ).id;
  await ok('status', { id, status: 'EM CRIAÇÃO' });
  await ok('saveVersion', {
    id,
    headline: 'QA',
    caption: 'QA',
    hashtags: ['#A', '#B', '#C', '#D', '#E'],
    feedUrl: '/api/assets/' + asset.body.id,
    storyUrl: '',
  });
  await ok('status', { id, status: 'REVISÃO' });
  await ok('status', { id, status: 'APROVAÇÃO' });
  s = await state();
  const expectedRevision = s.contents.find((c) => c.id === id).revision;
  const results = await Promise.all([
    post('status', {
      id,
      expectedRevision,
      status: 'APROVADO',
      addReference: true,
    }),
    post('status', {
      id,
      expectedRevision,
      status: 'ALTERAÇÃO',
      comment: 'QA pedido de alteração',
    }),
  ]);
  assert.deepEqual(
    results.map((r) => r.status).sort((a,b)=>a-b),
    [200, 409],
    JSON.stringify(results),
  );
  s = await state();
  const approved = s.contents.find((c) => c.id === id).status === 'APROVADO';
  assert.equal(
    s.versions.filter((v) => v.contentId === id && v.locked).length,
    approved ? 1 : 0,
  );
  assert.equal(
    s.comments.filter((c) => c.contentId === id).length,
    approved ? 0 : 1,
  );
  assert.equal(
    s.assets.find((a) => a.id === asset.body.id).approved,
    approved ? 1 : 0,
  );
  assert.equal(
    (
      await post('status', {
        id,
        expectedRevision,
        status: 'ALTERAÇÃO',
        comment: 'stale',
      })
    ).status,
    409,
  );
}
console.log(
  JSON.stringify({
    passed: true,
    qaBrandId: brand,
    concurrentRounds: 3,
    checks: [
      'imagem truncada',
      'marca obrigatória',
      'datas isoladas',
      'revisão sem perder pautas',
      'uma decisão por revisão',
      'conflito sem efeitos colaterais',
    ],
  }),
);
