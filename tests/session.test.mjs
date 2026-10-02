import test from 'node:test';
import assert from 'node:assert/strict';
import { signSession, readSession, checkPassword } from '../lib/session.ts';
import { sessionClaims, hashPassword } from '../lib/session.ts';
test('member session carries uid/version; owner-only reader rejects it', () => {
  const secret = 'x'.repeat(40), now = Date.now();
  const req = (t) => new Request('https://x.app/', { headers: { cookie: 'coody_session=' + t } });
  const token = signSession('Maria@Ex.com', secret, now, { uid: 'm1', ver: 3 });
  assert.deepEqual(sessionClaims(req(token), secret, now), { email: 'maria@ex.com', uid: 'm1', ver: 3 });
  assert.equal(sessionClaims(req(token + 'x'), secret, now), null);
  assert.equal(sessionClaims(req(token), secret, now + 43200001), null);
  assert.equal(readSession(req(token), 'owner@ex.com', secret, now).status, 401);
  const owner = sessionClaims(req(signSession('owner@ex.com', secret, now)), secret, now);
  assert.equal(owner.uid, undefined);
  const h = hashPassword('senha-forte-1');
  assert.ok(checkPassword('senha-forte-1', h) && !checkPassword('outra', h));
});
