import test from 'node:test';
import assert from 'node:assert/strict';
import { identify } from '../lib/identity.ts';
const headers = (email = 'owner@example.com') =>
  new Headers({
    'oai-authenticated-user-id': 'site-user-1',
    'oai-authenticated-user-email': email,
    'oai-authenticated-user-full-name': 'Andr%C3%A9',
    'oai-authenticated-user-full-name-encoding': 'percent-encoded-utf-8',
  });
void test('missing identity is rejected', () =>
  assert.equal(identify(new Headers(), 'owner@example.com').status, 401));
void test('authenticated non-owner is rejected', () =>
  assert.equal(
    identify(headers('other@example.com'), 'owner@example.com').status,
    403,
  ));
void test('missing allowlist fails closed', () =>
  assert.equal(identify(headers(), '').status, 403));
void test('trusted owner gets real identity and decoded name', () =>
  assert.deepEqual(identify(headers(), 'OWNER@example.com'), {
    id: 'site-user-1',
    email: 'owner@example.com',
    name: 'André',
    role: 'ADMINISTRADOR',
  }));
