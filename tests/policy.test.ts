import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowed, canonicalPath } from '../packages/core/src/policy.js';
import type { Grant } from '../packages/core/src/types.js';
const grant = (overrides: Partial<Grant> = {}): Grant => ({
  id: 'g',
  workspaceId: 'w',
  agentId: 'a',
  scope: '/research',
  actions: ['read', 'write'],
  effect: 'allow',
  expiresAt: null,
  revokedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});
test('default deny and segment-boundary scopes prevent neighboring-domain access', () => {
  assert.equal(allowed([], 'read', '/research/a.md'), false);
  assert.equal(allowed([grant()], 'read', '/research/a.md'), true);
  assert.equal(allowed([grant()], 'read', '/research-private/a.md'), false);
  assert.equal(allowed([grant()], 'delete', '/research/a.md'), false);
});
test('matching denies override allows and root scope covers descendants', () => {
  assert.equal(
    allowed(
      [grant({ scope: '/' }), grant({ id: 'deny', scope: '/research/private', effect: 'deny' })],
      'read',
      '/research/private/a.md',
    ),
    false,
  );
  assert.equal(allowed([grant({ scope: '/' })], 'read', '/drafts/a.md'), true);
});
test('expired or revoked grants cannot authorize reads', () => {
  assert.equal(
    allowed([grant({ expiresAt: '2000-01-01T00:00:00Z' })], 'read', '/research/a.md'),
    false,
  );
  assert.equal(allowed([grant({ revokedAt: '2026-01-01' })], 'read', '/research/a.md'), false);
  assert.equal(allowed([grant({ expiresAt: 'invalid' })], 'read', '/research/a.md'), false);
});
test('virtual paths reject ambiguous aliases and traversal', () => {
  for (const path of [
    '../secret',
    '/a/../b',
    '/a/./b',
    '/a//b',
    '/a/',
    '/a\\b',
    '/%2e%2e/key',
    '/a\u0000b',
    '/',
  ])
    assert.throws(() => canonicalPath(path));
  assert.equal(canonicalPath('/research/notes.md'), '/research/notes.md');
  assert.equal(canonicalPath('/', true), '/');
});
