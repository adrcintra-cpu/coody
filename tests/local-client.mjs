import assert from 'node:assert/strict';
export function fetch(url, options = {}) {
  assert.equal(
    new URL(url).origin,
    'http://localhost:3000',
    'Tests must stay local',
  );
  const headers = new Headers(options.headers);
  headers.set('Cookie', '__sites_local_auth=1');
  return globalThis.fetch(url, { ...options, headers });
}
export async function ensureTestBrand() {
  const response = await fetch('http://localhost:3000/api/workspace');
  assert.equal(response.status, 200);
  const state = await response.json();
  if (!state.brands.length) {
    const created = await fetch('http://localhost:3000/api/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'saveBrand',
        data: {
          name: 'QA reference',
          segment: 'Tests',
          voice: 'Clara',
          pillars: [{ name: 'Produtos', percent: 100 }],
        },
      }),
    });
    assert.equal(created.status, 200, await created.text());
  }
}
