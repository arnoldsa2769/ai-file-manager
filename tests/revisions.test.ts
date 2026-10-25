import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { WorkspaceService } from '../packages/core/src/service.js';
import { operator } from '../packages/core/src/types.js';
import { createApp } from '../apps/server/src/app.js';
import { WorkspaceClient, WorkspaceApiError } from '../packages/sdk/src/index.js';
import { createMcpServer } from '../packages/mcp/src/server.js';

const adminToken = 'revision-tests-operator-token-at-least-24';

function fixture(t: TestContext) {
  const service = new WorkspaceService(':memory:');
  t.after(() => service.close());
  const workspace = service.createWorkspace(operator, 'Revision tests');
  const identity = service.createAgent(operator, workspace.id, {
    name: 'Reader',
    domain: 'Drafts',
    provider: 'External',
  });
  const agent = service.authenticateAgent(identity.token)!;
  const grant = service.createGrant(operator, workspace.id, {
    agentId: agent.id,
    scope: '/drafts',
    actions: ['read'],
    effect: 'allow',
  });
  function publish(path: string, content: string | null, baseRevision: string | null = null) {
    const change = service.propose(operator, workspace.id, {
      title: 'Revision fixture',
      operations: [{ path, content, baseRevision }],
    });
    service.approve(operator, workspace.id, change.id);
    service.apply(operator, workspace.id, change.id);
    return service.readDocument(operator, workspace.id, path, true);
  }
  const first = publish('/drafts/a.md', 'Original snapshot');
  const latest = publish('/drafts/a.md', 'Latest snapshot', first.currentRevision);
  const other = publish('/drafts/b.md', 'Other document');
  return { service, workspace, agent, identity, grant, first, latest, other, publish };
}

test('exact revision reads return historical snapshots and tombstones without rewinding heads', (t) => {
  const { service: s, workspace: w, agent: a, first, latest, publish } = fixture(t);
  const snapshot = s.revision(a, w.id, '/drafts/a.md', first.currentRevision);
  assert.equal(snapshot.content, 'Original snapshot');
  assert.equal(snapshot.id, first.currentRevision);
  assert.equal(snapshot.path, '/drafts/a.md');
  assert.equal(snapshot.parentId, null);
  assert.throws(() => s.revision(a, w.id, '/drafts/a.md', ` ${first.currentRevision} `), {
    code: 'INVALID_INPUT',
  });
  assert.equal(s.readDocument(a, w.id, '/drafts/a.md').content, 'Latest snapshot');
  const deleted = publish('/drafts/a.md', null, latest.currentRevision);
  const tombstone = s.revision(a, w.id, '/drafts/a.md', deleted.currentRevision);
  assert.equal(tombstone.deleted, true);
  assert.equal(tombstone.content, null);
  assert.equal(tombstone.parentId, latest.currentRevision);
  assert.equal(
    s.revision(a, w.id, '/drafts/a.md', first.currentRevision).content,
    'Original snapshot',
  );
  assert.equal(
    s.readDocument(operator, w.id, '/drafts/a.md', true).currentRevision,
    deleted.currentRevision,
  );
});

test('revision IDs are bound to workspace and path, with authorization checked before existence', (t) => {
  const { service: s, workspace: w, agent: a, first, other } = fixture(t);
  assert.throws(() => s.revision(a, w.id, '/drafts/a.md', other.currentRevision), {
    code: 'NOT_FOUND',
  });
  assert.throws(() => s.revision(a, w.id, '/drafts/a.md', 'unknown'), { code: 'NOT_FOUND' });
  const different = s.createWorkspace(operator, 'Different workspace');
  assert.throws(() => s.revision(operator, different.id, '/drafts/a.md', first.currentRevision), {
    code: 'NOT_FOUND',
  });
  assert.throws(() => s.revision(a, different.id, '/drafts/a.md', first.currentRevision), {
    code: 'FORBIDDEN',
  });
  for (const id of [first.currentRevision, 'unknown']) {
    assert.throws(() => s.revision(a, w.id, '/private/secret.md', id), { code: 'FORBIDDEN' });
    assert.throws(() => s.revision(a, w.id, '/drafts-private/a.md', id), { code: 'FORBIDDEN' });
  }
  assert.throws(() => s.revision(a, w.id, '/drafts/../private', first.currentRevision), {
    code: 'INVALID_PATH',
  });
  s.createGrant(operator, w.id, {
    agentId: a.id,
    scope: '/drafts/a.md',
    actions: ['read'],
    effect: 'deny',
  });
  assert.throws(() => s.revision(a, w.id, '/drafts/a.md', first.currentRevision), {
    code: 'FORBIDDEN',
  });
});

test('historical revision access observes grant and identity revocation on subsequent calls', (t) => {
  const { service: s, workspace: w, agent: a, first, grant, identity } = fixture(t);
  assert.equal(
    s.revision(a, w.id, '/drafts/a.md', first.currentRevision).content,
    'Original snapshot',
  );
  s.revokeGrant(operator, w.id, grant.id);
  assert.throws(() => s.revision(a, w.id, '/drafts/a.md', first.currentRevision), {
    code: 'FORBIDDEN',
  });
  s.createGrant(operator, w.id, {
    agentId: a.id,
    scope: '/drafts',
    actions: ['read'],
    effect: 'allow',
  });
  s.revokeAgent(operator, w.id, identity.agent.id);
  assert.throws(() => s.revision(a, w.id, '/drafts/a.md', first.currentRevision), {
    code: 'FORBIDDEN',
  });
});

test('HTTP revision queries are strict, authenticated, scoped, and never cacheable', async (t) => {
  const { service, workspace: w, identity, first } = fixture(t);
  const app = await createApp({ service, adminToken });
  t.after(() => app.close());
  const root = `/v1/workspaces/${w.id}/revision`;
  const query = `?path=%2Fdrafts%2Fa.md&revisionId=${first.currentRevision}`;
  const headers = { authorization: `Bearer ${identity.token}` };
  assert.equal((await app.inject({ url: root + query })).statusCode, 401);
  const response = await app.inject({ url: root + query, headers });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().content, 'Original snapshot');
  assert.equal(response.headers['cache-control'], 'no-store');
  for (const suffix of [
    '',
    '?path=/drafts/a.md',
    '?revisionId=unknown',
    '?path=/drafts/a.md&revisionId=',
    `?path=/drafts/a.md&revisionId=%20${first.currentRevision}%20`,
    query + '&extra=true',
  ]) {
    const invalid = await app.inject({ url: root + suffix, headers });
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.json().error.code, 'INVALID_INPUT');
  }
  const missing = await app.inject({
    url: root + '?path=/drafts/a.md&revisionId=unknown',
    headers,
  });
  assert.equal(missing.statusCode, 404);
  const denied = await app.inject({
    url: root + `?path=/private/secret.md&revisionId=${first.currentRevision}`,
    headers,
  });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.body.includes('Original snapshot'), false);
});

test('SDK and MCP read exact revisions through the real HTTP permission boundary', async (t) => {
  const { service, workspace: w, identity, first, other, grant } = fixture(t);
  const app = await createApp({ service, adminToken });
  const url = await app.listen({ host: '127.0.0.1', port: 0 });
  t.after(() => app.close());
  const sdk = new WorkspaceClient({ baseUrl: url, token: identity.token });
  assert.equal(
    (await sdk.revision(w.id, '/drafts/a.md', first.currentRevision)).content,
    'Original snapshot',
  );
  await assert.rejects(
    sdk.revision(w.id, '/drafts/a.md', other.currentRevision),
    (error: unknown) =>
      error instanceof WorkspaceApiError && error.code === 'NOT_FOUND' && error.status === 404,
  );
  const bridge = createMcpServer(sdk, w.id);
  const client = new Client({ name: 'revision-tests', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await bridge.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => {
    await client.close();
    await bridge.close();
  });
  const tools = await client.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === 'read_revision'));
  const result = await client.callTool({
    name: 'read_revision',
    arguments: { path: '/drafts/a.md', revisionId: first.currentRevision },
  });
  assert.equal(result.isError, undefined);
  const content = result.content as { type: string; text: string }[];
  assert.equal(JSON.parse(content[0]!.text).content, 'Original snapshot');
  service.revokeGrant(operator, w.id, grant.id);
  const denied = await client.callTool({
    name: 'read_revision',
    arguments: { path: '/drafts/a.md', revisionId: first.currentRevision },
  });
  assert.equal(denied.isError, true);
  assert.equal(JSON.stringify(denied.content).includes('Original snapshot'), false);
});
