import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceService } from '../packages/core/src/service.js';
import { operator } from '../packages/core/src/types.js';
import { createApp } from '../apps/server/src/app.js';
const token = 'test-operator-token-at-least-24-characters';
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const service = new WorkspaceService(':memory:');
  const app = await createApp({
    service,
    adminToken: token,
    allowedOrigin: 'http://127.0.0.1:5173',
  });
  t.after(async () => {
    await app.close();
    service.close();
  });
  const workspace = service.createWorkspace(operator, 'Test workspace');
  const agent = service.createAgent(operator, workspace.id, {
    name: 'Agent',
    domain: 'Research',
    provider: 'External',
  });
  return { app, service, workspace, agent };
}
test('API authenticates bearer tokens and rejects unknown or forged identities', async (t) => {
  const { app } = await fixture(t);
  assert.equal((await app.inject({ method: 'GET', url: '/v1/workspaces' })).statusCode, 401);
  assert.equal(
    (
      await app.inject({
        method: 'GET',
        url: '/v1/workspaces',
        headers: { authorization: 'Bearer invalid' },
      })
    ).statusCode,
    401,
  );
  const response = await app.inject({
    method: 'GET',
    url: '/v1/workspaces',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().length, 1);
});
test('unapproved origins fail while explicit loopback origins receive CORS headers', async (t) => {
  const { app } = await fixture(t);
  const denied = await app.inject({
    method: 'GET',
    url: '/v1/workspaces',
    headers: { authorization: `Bearer ${token}`, origin: 'https://evil.example' },
  });
  assert.equal(denied.statusCode, 403);
  const allowed = await app.inject({
    method: 'GET',
    url: '/v1/workspaces',
    headers: { authorization: `Bearer ${token}`, origin: 'http://127.0.0.1:5173' },
  });
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.headers['access-control-allow-origin'], 'http://127.0.0.1:5173');
});
test('input schemas reject unknown fields and agent tokens cannot administer or approve', async (t) => {
  const { app, workspace: w, agent: a } = await fixture(t);
  const headers = { authorization: `Bearer ${token}` };
  const invalid = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers,
    payload: { name: 'Bad', admin: true },
  });
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.json().error.code, 'INVALID_INPUT');
  const denied = await app.inject({
    method: 'GET',
    url: `/v1/workspaces/${w.id}/overview`,
    headers: { authorization: `Bearer ${a.token}` },
  });
  assert.equal(denied.statusCode, 403);
  const approval = await app.inject({
    method: 'POST',
    url: `/v1/workspaces/${w.id}/changes/missing/approve`,
    headers: { authorization: `Bearer ${a.token}` },
    payload: {},
  });
  assert.equal(approval.statusCode, 403);
});
test('operator overview never returns agent token digests and authenticated requests are not cacheable', async (t) => {
  const { app, workspace: w, agent: a } = await fixture(t);
  const res = await app.inject({
    method: 'GET',
    url: `/v1/workspaces/${w.id}/overview`,
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.body.includes(a.token), false);
  assert.equal(res.body.includes('tokenHash'), false);
});
test('HTTP agent documents remain scoped and workspace boundaries are enforced', async (t) => {
  const { app, service: s, workspace: w, agent: a } = await fixture(t);
  const c = s.propose(operator, w.id, {
    title: 'Private',
    operations: [{ path: '/secret', content: 'sensitive', baseRevision: null }],
  });
  s.approve(operator, w.id, c.id);
  s.apply(operator, w.id, c.id);
  const headers = { authorization: `Bearer ${a.token}` };
  const listing = await app.inject({
    method: 'GET',
    url: `/v1/workspaces/${w.id}/documents`,
    headers,
  });
  assert.equal(listing.statusCode, 200);
  assert.deepEqual(listing.json(), []);
  const denied = await app.inject({
    method: 'GET',
    url: `/v1/workspaces/${w.id}/document?path=/secret`,
    headers,
  });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.body.includes('sensitive'), false);
  const other = s.createWorkspace(operator, 'Other');
  assert.equal(
    (await app.inject({ method: 'GET', url: `/v1/workspaces/${other.id}/documents`, headers }))
      .statusCode,
    403,
  );
});
