import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createApp } from '../apps/server/src/app.js';
import { WorkspaceService } from '../packages/core/src/service.js';
import { operator } from '../packages/core/src/types.js';
import { WorkspaceClient } from '../packages/sdk/src/index.js';
import { createMcpServer } from '../packages/mcp/src/server.js';

const token = 'idempotency-test-operator-at-least-24';
const proposal = {
  title: 'Retry safely',
  operations: [{ path: '/draft.md', baseRevision: null, content: 'One immutable proposal' }],
};
async function fixture(t: TestContext, persistent = false) {
  const directory = mkdtempSync(join(tmpdir(), 'afm-retry-'));
  const path = persistent ? join(directory, 'workspace.db') : ':memory:';
  const service = new WorkspaceService(path);
  const app = await createApp({ service, adminToken: token });
  t.after(async () => {
    await app.close();
    service.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const workspace = service.createWorkspace(operator, 'Retry workspace');
  const identity = service.createAgent(operator, workspace.id, {
    name: 'Writer',
    domain: 'Drafts',
    provider: 'External',
  });
  const grant = service.createGrant(operator, workspace.id, {
    agentId: identity.agent.id,
    scope: '/',
    actions: ['read', 'write'],
    effect: 'allow',
  });
  const root = `/v1/workspaces/${workspace.id}`;
  const headers = { authorization: `Bearer ${identity.token}`, 'idempotency-key': 'proposal-1' };
  return { service, app, workspace, identity, grant, root, headers, path };
}

test('proposal retries return the original response and record one mutation, including concurrent requests', async (t) => {
  const { app, service, workspace, root, headers } = await fixture(t);
  const responses = await Promise.all(
    Array.from({ length: 4 }, () =>
      app.inject({ method: 'POST', url: `${root}/changes`, headers, payload: proposal }),
    ),
  );
  assert.ok(responses.every((r) => r.statusCode === 201));
  assert.ok(responses.every((r) => r.body === responses[0]!.body));
  const id = responses[0]!.json().id;
  service.approve(operator, workspace.id, id);
  const replay = await app.inject({
    method: 'POST',
    url: `${root}/changes`,
    headers,
    payload: {
      operations: [{ content: 'One immutable proposal', path: '/draft.md', baseRevision: null }],
      title: 'Retry safely',
    },
  });
  assert.equal(replay.statusCode, 201);
  assert.equal(replay.json().status, 'pending');
  assert.equal(service.listChanges(operator, workspace.id).length, 1);
  assert.equal(
    service.overview(operator, workspace.id).activity.filter((e) => e.action === 'change.proposed')
      .length,
    1,
  );
});

test('a key is scoped to principal and workspace and cannot be rebound to another request', async (t) => {
  const { app, service, workspace, root, headers } = await fixture(t);
  const first = await app.inject({
    method: 'POST',
    url: `${root}/changes`,
    headers,
    payload: proposal,
  });
  const conflict = await app.inject({
    method: 'POST',
    url: `${root}/changes`,
    headers,
    payload: { ...proposal, title: 'Different request' },
  });
  assert.equal(conflict.statusCode, 409);
  assert.equal(conflict.json().error.code, 'IDEMPOTENCY_CONFLICT');
  const adminHeaders = { authorization: `Bearer ${token}`, 'idempotency-key': 'proposal-1' };
  const otherPrincipal = await app.inject({
    method: 'POST',
    url: `${root}/changes`,
    headers: adminHeaders,
    payload: proposal,
  });
  assert.equal(otherPrincipal.statusCode, 201);
  assert.notEqual(otherPrincipal.json().id, first.json().id);
  const other = service.createWorkspace(operator, 'Other');
  const otherWorkspace = await app.inject({
    method: 'POST',
    url: `/v1/workspaces/${other.id}/changes`,
    headers: adminHeaders,
    payload: proposal,
  });
  assert.equal(otherWorkspace.statusCode, 201);
  assert.notEqual(otherWorkspace.json().id, otherPrincipal.json().id);
  assert.equal(service.listChanges(operator, workspace.id).length, 2);
});

test('replay rechecks current grants and active identity before exposing cached content', async (t) => {
  const { app, service, workspace, grant, identity, root, headers } = await fixture(t);
  assert.equal(
    (await app.inject({ method: 'POST', url: `${root}/changes`, headers, payload: proposal }))
      .statusCode,
    201,
  );
  service.revokeGrant(operator, workspace.id, grant.id);
  const denied = await app.inject({
    method: 'POST',
    url: `${root}/changes`,
    headers,
    payload: proposal,
  });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.body.includes('One immutable proposal'), false);
  service.revokeAgent(operator, workspace.id, identity.agent.id);
  assert.equal(
    (await app.inject({ method: 'POST', url: `${root}/changes`, headers, payload: proposal }))
      .statusCode,
    401,
  );
});

test('apply retries append one revision and no-key calls retain the existing state contract', async (t) => {
  const { app, service, workspace, root } = await fixture(t);
  const change = service.propose(operator, workspace.id, proposal);
  service.approve(operator, workspace.id, change.id);
  const url = `${root}/changes/${change.id}/apply`;
  const headers = { authorization: `Bearer ${token}`, 'idempotency-key': 'apply-1' };
  const first = await app.inject({ method: 'POST', url, headers, payload: {} });
  const retry = await app.inject({ method: 'POST', url, headers, payload: {} });
  assert.equal(first.statusCode, 200);
  assert.equal(retry.statusCode, 200);
  assert.equal(retry.body, first.body);
  assert.equal(service.history(operator, workspace.id, '/draft.md').length, 1);
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url,
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      })
    ).statusCode,
    409,
  );
  const rebound = await app.inject({
    method: 'POST',
    url: `${root}/changes`,
    headers,
    payload: proposal,
  });
  assert.equal(rebound.statusCode, 409);
  const emptyBodyMismatch = await app.inject({
    method: 'POST',
    url,
    headers,
    payload: { override: true },
  });
  assert.equal(emptyBodyMismatch.statusCode, 400);
});

test('invalid keys and unsupported routes fail explicitly and CORS allows the documented header', async (t) => {
  const { app, root } = await fixture(t);
  for (const key of ['', 'space key', 'x'.repeat(129), 'padded ']) {
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url: `${root}/changes`,
          headers: { authorization: `Bearer ${token}`, 'idempotency-key': key },
          payload: proposal,
        })
      ).statusCode,
      400,
    );
  }
  const unsupported = await app.inject({
    method: 'POST',
    url: `${root}/agents`,
    headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'not-supported' },
    payload: { name: 'No credential replay', domain: 'Drafts', provider: 'External' },
  });
  assert.equal(unsupported.statusCode, 400);
  const preflight = await app.inject({
    method: 'OPTIONS',
    url: `${root}/changes`,
    headers: {
      origin: 'http://127.0.0.1:7310',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization,idempotency-key,content-type',
    },
  });
  assert.match(String(preflight.headers['access-control-allow-headers']), /idempotency-key/i);
});

test('response records survive restart and a storage failure rolls back the business mutation', async (t) => {
  const { app, service, workspace, path, root, headers } = await fixture(t, true);
  const disk = new Database(path);
  disk.exec(
    "CREATE TRIGGER reject_receipt BEFORE INSERT ON idempotency BEGIN SELECT RAISE(ABORT, 'receipt unavailable'); END",
  );
  const failed = await app.inject({
    method: 'POST',
    url: `${root}/changes`,
    headers,
    payload: proposal,
  });
  assert.equal(failed.statusCode, 500);
  assert.equal(service.listChanges(operator, workspace.id).length, 0);
  disk.exec('DROP TRIGGER reject_receipt');
  const first = await app.inject({
    method: 'POST',
    url: `${root}/changes`,
    headers,
    payload: proposal,
  });
  assert.equal(first.statusCode, 201);
  assert.equal(disk.prepare('SELECT COUNT(*) AS n FROM idempotency').get().n, 1);
  assert.equal(
    JSON.stringify(disk.prepare('SELECT * FROM idempotency').all()).includes('proposal-1'),
    false,
  );
  disk.close();
  await app.close();
  service.close();
  const reopened = new WorkspaceService(path);
  const nextApp = await createApp({ service: reopened, adminToken: token });
  t.after(async () => {
    await nextApp.close();
    reopened.close();
  });
  const replay = await nextApp.inject({
    method: 'POST',
    url: `${root}/changes`,
    headers,
    payload: proposal,
  });
  assert.equal(replay.statusCode, 201);
  assert.equal(replay.body, first.body);
  assert.equal(reopened.listChanges(operator, workspace.id).length, 1);
});

test('schema 1 upgrades without losing existing documents or their immutable history', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'afm-migration-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'workspace.db');
  const disk = new Database(path);
  disk.exec(readFileSync(new URL('./fixtures/schema-v1.sql', import.meta.url), 'utf8'));
  disk.close();
  const service = new WorkspaceService(path);
  t.after(() => service.close());
  const check = new Database(path);
  t.after(() => check.close());
  assert.equal(check.pragma('user_version', { simple: true }), 2);
  assert.equal(
    service.readDocument(operator, 'existing-workspace', '/existing.md').content,
    'Preserved content',
  );
  assert.equal(
    service.history(operator, 'existing-workspace', '/existing.md')[0]!.id,
    'existing-revision',
  );
  assert.equal(check.prepare('SELECT COUNT(*) AS n FROM idempotency').get().n, 0);
});

test('explicit SDK and MCP proposal keys reach the same durable HTTP contract', async (t) => {
  const { app, root, headers, workspace, identity } = await fixture(t);
  const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  const sdk = new WorkspaceClient({ baseUrl, token: identity.token });
  const first = await sdk.propose(workspace.id, proposal.title, proposal.operations, {
    idempotencyKey: 'sdk-key',
  });
  const retry = await sdk.propose(workspace.id, proposal.title, proposal.operations, {
    idempotencyKey: 'sdk-key',
  });
  assert.equal(first.id, retry.id);
  const bridge = createMcpServer(sdk, workspace.id);
  const client = new Client({ name: 'retry-test', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await bridge.connect(b);
  await client.connect(a);
  t.after(async () => {
    await client.close();
    await bridge.close();
  });
  const arguments_ = { ...proposal, idempotencyKey: 'mcp-key' };
  const x = await client.callTool({ name: 'propose_changes', arguments: arguments_ });
  const y = await client.callTool({ name: 'propose_changes', arguments: arguments_ });
  assert.equal(x.isError, undefined);
  assert.deepEqual(x.content, y.content);
  const existing = await app.inject({
    method: 'GET',
    url: `${root}/changes`,
    headers: { authorization: headers.authorization },
  });
  assert.equal(existing.json().length, 2);
});
