import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validCredentials,
  seal,
  unseal,
  trello,
} from '../lib/trello-client.ts';
const creds = { key: 'a'.repeat(32), token: 'b'.repeat(64) };
const secret = Buffer.alloc(32, 7).toString('base64');
test('Trello credentials are encrypted with random IV and tampering is rejected', async () => {
  const a = await seal(creds, secret),
    b = await seal(creds, secret);
  assert.notEqual(a, b);
  assert.deepEqual(await unseal(a, secret), creds);
  assert.ok(!a.includes(creds.token));
  const bytes = Buffer.from(a, 'base64');
  bytes[20] ^= 1;
  await assert.rejects(unseal(bytes.toString('base64'), secret));
});
test('invalid credentials rejected', () => {
  for (const c of [
    null,
    {},
    { key: 'x', token: 'y' },
    { key: 'a'.repeat(32), token: 'bad"token' },
  ])
    assert.equal(validCredentials(c), false);
  assert.equal(validCredentials(creds), true);
});
test('Trello authorization stays in header and requests are not blindly retried', async () => {
  let count = 0;
  const result = await trello(creds, '/members/me', {}, async (url, opts) => {
    count++;
    assert.equal(url, 'https://api.trello.com/1/members/me');
    assert.ok(!url.includes(creds.token));
    assert.match(opts.headers.get('Authorization'), /oauth_token/);
    assert.equal(opts.redirect, 'manual');
    return Response.json({ id: 'member' });
  });
  assert.equal(result.id, 'member');
  assert.equal(count, 1);
});
test('provider errors do not leak credentials or raw response', async () => {
  await assert.rejects(
    trello(
      creds,
      '/members/me',
      {},
      async () => new Response(creds.token, { status: 401 }),
    ),
    (e) => !e.message.includes(creds.token) && e.message.includes('recusado'),
  );
  await assert.rejects(
    trello(creds, '/cards', {}, async () => new Response('', { status: 429 })),
    /Limite/,
  );
});
test('arbitrary remote URLs rejected', async () => {
  await assert.rejects(trello(creds, 'https://example.com'), /inválido/);
});

test('redirect response is rejected without following or retrying', async () => {
 let calls=0;
 await assert.rejects(trello(creds,'/members/me',{},async()=>{calls++;return new Response('',{status:302,headers:{Location:'https://example.com'}});}),/não concluiu/);
 assert.equal(calls,1);
});
