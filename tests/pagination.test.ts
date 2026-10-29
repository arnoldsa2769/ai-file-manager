import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { WorkspaceService } from '../packages/core/src/service.js';
import { operator } from '../packages/core/src/types.js';
import { createApp } from '../apps/server/src/app.js';
import { WorkspaceClient } from '../packages/sdk/src/index.js';

const token = 'pagination-operator-token-at-least-24';
async function fixture(t: TestContext) {
  const service = new WorkspaceService(':memory:');
  const workspace = service.createWorkspace(operator, 'Pages');
  const identity = service.createAgent(operator, workspace.id, {
    name: 'Reader',
    domain: 'Drafts',
    provider: 'External',
  });
  const principal = service.authenticateAgent(identity.token)!;
  const grant = service.createGrant(operator, workspace.id, {
    agentId: principal.id,
    scope: '/visible',
    actions: ['read', 'write'],
    effect: 'allow',
  });
  const app = await createApp({ service, adminToken: token });
  t.after(async () => {
    await app.close();
    service.close();
  });
  const root = `/v1/workspaces/${workspace.id}`;
  const headers = { authorization: `Bearer ${token}` };
  function publish(
    path: string,
    content = 'Private document content',
    baseRevision: string | null = null,
  ) {
    const c = service.propose(operator, workspace.id, {
      title: path,
      operations: [{ path, content, baseRevision }],
    });
    service.approve(operator, workspace.id, c.id);
    service.apply(operator, workspace.id, c.id);
    return service.readDocument(operator, workspace.id, path);
  }
  return { service, workspace, identity, principal, grant, app, root, headers, publish };
}

test('document pages contain bounded metadata and stable continuation across new inserts', async (t) => {
  const { app, root, headers, publish } = await fixture(t);
  publish('/visible/a');
  publish('/visible/b');
  publish('/visible/c');
  const first = await app.inject({ url: `${root}/documents/page?limit=2`, headers });
  assert.equal(first.statusCode, 200);
  assert.deepEqual(
    first.json().items.map((d: { path: string }) => d.path),
    ['/visible/c', '/visible/b'],
  );
  assert.equal(first.body.includes('Private document content'), false);
  assert.equal(first.body.includes('"content"'), false);
  publish('/visible/new');
  const next = await app.inject({
    url: `${root}/documents/page?limit=2&cursor=${first.json().nextCursor}`,
    headers,
  });
  assert.deepEqual(
    next.json().items.map((d: { path: string }) => d.path),
    ['/visible/a'],
  );
  assert.equal(next.json().nextCursor, null);
  assert.equal(next.headers['cache-control'], 'no-store');
  const fresh = await app.inject({ url: `${root}/documents/page?limit=2`, headers });
  assert.equal(fresh.json().items[0].path, '/visible/new');
});

test('summary and change pages never ship proposal bodies and legacy routes retain their shapes', async (t) => {
  const { app, service, workspace, root, headers, publish } = await fixture(t);
  publish('/visible/a');
  const pending = service.propose(operator, workspace.id, {
    title: 'Pending',
    operations: [{ path: '/visible/b', content: 'Secret proposed text', baseRevision: null }],
  });
  const summary = await app.inject({ url: `${root}/summary`, headers });
  assert.equal(summary.statusCode, 200);
  assert.equal(summary.json().counts.documents, 1);
  assert.equal(summary.json().counts.pendingChanges, 1);
  assert.equal(summary.body.includes('Private document content'), false);
  assert.equal(summary.body.includes('Secret proposed text'), false);
  const page = await app.inject({ url: `${root}/changes/page?status=pending`, headers });
  assert.equal(page.json().items.length, 1);
  assert.equal(page.json().items[0].id, pending.id);
  assert.equal(page.json().items[0].operationCount, 1);
  assert.equal('operations' in page.json().items[0], false);
  const legacy = await app.inject({ url: `${root}/documents`, headers });
  assert.ok(Array.isArray(legacy.json()));
  assert.equal(legacy.json()[0].content, 'Private document content');
  assert.ok(Array.isArray((await app.inject({ url: `${root}/overview`, headers })).json().changes));
});

test('page inputs and cursor context reject malformed, cross-route, cross-filter, and cross-principal navigation', async (t) => {
  const { app, service, root, workspace, headers, identity, publish } = await fixture(t);
  publish('/visible/a');
  publish('/visible/b');
  for (const q of [
    'limit=0',
    'limit=101',
    'limit=-1',
    'limit=1.5',
    'limit=NaN',
    'limit=',
    'cursor=bad',
    'unknown=x',
    'status=pending',
    'includeDeleted=yes',
  ]) {
    assert.equal(
      (await app.inject({ url: `${root}/documents/page?${q}`, headers })).statusCode,
      400,
      q,
    );
  }
  const first = (await app.inject({ url: `${root}/documents/page?limit=1`, headers })).json();
  for (const url of [
    `${root}/changes/page?cursor=${first.nextCursor}`,
    `${root}/documents/page?query=a&cursor=${first.nextCursor}`,
    `${root}/documents/page?includeDeleted=true&cursor=${first.nextCursor}`,
  ])
    assert.equal((await app.inject({ url, headers })).statusCode, 400);
  assert.equal(
    (
      await app.inject({
        url: `${root}/documents/page?cursor=${first.nextCursor}`,
        headers: { authorization: `Bearer ${identity.token}` },
      })
    ).statusCode,
    400,
  );
  const other = service.createWorkspace(operator, 'Other');
  assert.equal(
    (
      await app.inject({
        url: `/v1/workspaces/${other.id}/documents/page?cursor=${first.nextCursor}`,
        headers,
      })
    ).statusCode,
    400,
  );
  assert.equal((await app.inject({ url: `${root}/documents/page` })).statusCode, 401);
  for (const collection of ['agents', 'grants', 'activity'])
    assert.equal(
      (
        await app.inject({
          url: `${root}/${collection}/page`,
          headers: { authorization: `Bearer ${identity.token}` },
        })
      ).statusCode,
      403,
    );
});

test('agent pages enforce current scopes, own proposals, and task assignment without leaking hidden paths', async (t) => {
  const { app, root, service, workspace, principal, grant, identity, publish } = await fixture(t);
  publish('/visible/a');
  publish('/hidden/secret');
  const own = service.propose(principal, workspace.id, {
    title: 'Owned',
    operations: [{ path: '/visible/b', content: 'Own text', baseRevision: null }],
  });
  service.createTask(operator, workspace.id, {
    title: 'Assigned',
    instructions: 'One task',
    assigneeId: principal.id,
  });
  const second = service.createAgent(operator, workspace.id, {
    name: 'Other',
    domain: 'Other',
    provider: 'External',
  });
  service.createTask(operator, workspace.id, {
    title: 'Hidden task',
    instructions: 'Not for reader',
    assigneeId: second.agent.id,
  });
  const headers = { authorization: `Bearer ${identity.token}` };
  const docs = await app.inject({ url: `${root}/documents/page`, headers });
  assert.deepEqual(
    docs.json().items.map((d: { path: string }) => d.path),
    ['/visible/a'],
  );
  assert.equal(docs.body.includes('/hidden'), false);
  assert.deepEqual(
    (await app.inject({ url: `${root}/changes/page`, headers }))
      .json()
      .items.map((c: { id: string }) => c.id),
    [own.id],
  );
  assert.equal((await app.inject({ url: `${root}/tasks/page`, headers })).json().items.length, 1);
  service.revokeGrant(operator, workspace.id, grant.id);
  assert.equal(
    (await app.inject({ url: `${root}/documents/page`, headers })).json().items.length,
    0,
  );
  assert.equal((await app.inject({ url: `${root}/changes/page`, headers })).json().items.length, 0);
});

test('a sparse authorized page has bounded scanning and a continuation without exposing hidden identifiers', async (t) => {
  const { service, workspace, principal, publish } = await fixture(t);
  publish('/visible/oldest');
  for (let i = 0; i < 510; i++) publish(`/hidden/${i}`);
  const first = service.page(principal, workspace.id, 'documents', { limit: 1 });
  assert.deepEqual(first.items, []);
  assert.ok(first.nextCursor);
  const cursorText = Buffer.from(first.nextCursor!, 'base64url').toString();
  assert.equal(cursorText.includes('/hidden'), false);
  const second = service.page(principal, workspace.id, 'documents', {
    limit: 1,
    cursor: first.nextCursor!,
  });
  assert.equal(second.items[0]!.path, '/visible/oldest');
  assert.equal(second.nextCursor, null);
});

test('history metadata is path-bound and body-free, with exact snapshots remaining available', async (t) => {
  const { app, root, headers, publish, identity } = await fixture(t);
  const first = publish('/visible/a');
  publish('/visible/a', 'Second snapshot', first.currentRevision);
  publish('/visible/b');
  assert.equal((await app.inject({ url: `${root}/history/page`, headers })).statusCode, 400);
  const page = await app.inject({
    url: `${root}/history/page?path=%2Fvisible%2Fa&limit=1`,
    headers,
  });
  assert.equal(page.statusCode, 200);
  assert.equal(page.json().items.length, 1);
  assert.equal('content' in page.json().items[0], false);
  const id = page.json().items[0].id;
  assert.equal(
    (
      await app.inject({ url: `${root}/revision?path=%2Fvisible%2Fa&revisionId=${id}`, headers })
    ).json().content,
    'Second snapshot',
  );
  assert.equal(
    (
      await app.inject({
        url: `${root}/history/page?path=%2Fvisible%2Fb&cursor=${page.json().nextCursor}`,
        headers,
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await app.inject({
        url: `${root}/history/page?path=%2Fhidden%2Fa`,
        headers: { authorization: `Bearer ${identity.token}` },
      })
    ).statusCode,
    403,
  );
});

test('metadata search, deletion filters, admin pages, and SDK paging use the documented contract', async (t) => {
  const { app, service, workspace, root, headers, publish } = await fixture(t);
  const doc = publish('/visible/needle_');
  publish('/visible/other');
  const deletion = service.propose(operator, workspace.id, {
    title: 'Delete',
    operations: [{ path: doc.path, baseRevision: doc.currentRevision, content: null }],
  });
  service.approve(operator, workspace.id, deletion.id);
  service.apply(operator, workspace.id, deletion.id);
  assert.equal(
    (await app.inject({ url: `${root}/documents/page?query=needle`, headers })).json().items.length,
    0,
  );
  assert.equal(
    (
      await app.inject({ url: `${root}/documents/page?includeDeleted=true&query=_`, headers })
    ).json().items.length,
    1,
  );
  const agents = await app.inject({ url: `${root}/agents/page`, headers });
  assert.equal(agents.body.includes('tokenHash'), false);
  assert.equal(agents.json().items.length, 1);
  assert.equal((await app.inject({ url: `${root}/grants/page`, headers })).json().items.length, 1);
  assert.equal(
    (await app.inject({ url: `${root}/activity/page?limit=2`, headers })).json().items.length,
    2,
  );
  const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  const sdk = new WorkspaceClient({ baseUrl, token });
  assert.equal((await sdk.summary(workspace.id)).counts.documents, 1);
  assert.equal(
    (await sdk.page(workspace.id, 'documents', { query: 'other', limit: 1 })).items[0]!.path,
    '/visible/other',
  );
});
