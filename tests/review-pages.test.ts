import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { WorkspaceService } from '../packages/core/src/service.js';
import { operator, type Page, type Review } from '../packages/core/src/types.js';
import { createApp } from '../apps/server/src/app.js';
import { WorkspaceClient, WorkspaceApiError } from '../packages/sdk/src/index.js';
const token = 'review-pages-operator-token-at-least-24';
async function fixture(t: TestContext) {
  const service = new WorkspaceService(':memory:');
  const workspace = service.createWorkspace(operator, 'Review pages');
  const identity = service.createAgent(operator, workspace.id, {
    name: 'Writer',
    domain: 'Drafts',
    provider: 'External',
  });
  const peer = service.createAgent(operator, workspace.id, {
    name: 'Reviewer',
    domain: 'Drafts',
    provider: 'External',
  });
  const principal = service.authenticateAgent(identity.token)!;
  const reviewer = service.authenticateAgent(peer.token)!;
  const grant = service.createGrant(operator, workspace.id, {
    agentId: principal.id,
    scope: '/drafts',
    actions: ['read', 'write', 'review'],
    effect: 'allow',
  });
  const peerRead = service.createGrant(operator, workspace.id, {
    agentId: reviewer.id,
    scope: '/drafts',
    actions: ['read'],
    effect: 'allow',
  });
  const peerReview = service.createGrant(operator, workspace.id, {
    agentId: reviewer.id,
    scope: '/drafts',
    actions: ['review'],
    effect: 'allow',
  });
  const change = service.propose(principal, workspace.id, {
    title: 'A proposal',
    operations: [{ path: '/drafts/a.md', baseRevision: null, content: 'Proposal secret' }],
  });
  const other = service.propose(principal, workspace.id, {
    title: 'Other proposal',
    operations: [{ path: '/drafts/b.md', baseRevision: null, content: 'Other proposal secret' }],
  });
  const notes = Array.from({ length: 30 }, (_, n) =>
    service.addReview(operator, workspace.id, change.id, `Note ${n} ${'x'.repeat(100)}`),
  );
  const app = await createApp({ service, adminToken: token });
  t.after(async () => {
    await app.close();
    service.close();
  });
  const headers = { authorization: `Bearer ${token}` };
  const root = `/v1/workspaces/${workspace.id}/changes`;
  const url = `${root}/${change.id}/reviews/page`;
  return {
    service,
    workspace,
    identity,
    peer,
    principal,
    reviewer,
    grant,
    peerRead,
    peerReview,
    change,
    other,
    notes,
    app,
    headers,
    root,
    url,
  };
}

test('review pages are bounded newest-first with stable continuation and legacy oldest-first arrays', async (t) => {
  const f = await fixture(t);
  const first = await f.app.inject({ url: f.url, headers: f.headers });
  assert.equal(first.statusCode, 200);
  const page = first.json<Page<Review>>();
  assert.equal(page.items.length, 25);
  assert.deepEqual(
    page.items.map((n) => n.id),
    f.notes
      .slice(5)
      .reverse()
      .map((n) => n.id),
  );
  assert.equal(first.headers['cache-control'], 'no-store');
  assert.equal(first.body.includes('Proposal secret'), false);
  const newest = f.service.addReview(operator, f.workspace.id, f.change.id, 'New after first page');
  const second = await f.app.inject({
    url: `${f.url}?cursor=${page.nextCursor}&limit=2`,
    headers: f.headers,
  });
  assert.deepEqual(
    second.json().items.map((n: Review) => n.id),
    f.notes
      .slice(3, 5)
      .reverse()
      .map((n) => n.id),
  );
  const rest = await f.app.inject({
    url: `${f.url}?cursor=${second.json().nextCursor}&limit=100`,
    headers: f.headers,
  });
  assert.deepEqual(
    rest.json().items.map((n: Review) => n.id),
    f.notes
      .slice(0, 3)
      .reverse()
      .map((n) => n.id),
  );
  assert.equal(rest.json().nextCursor, null);
  assert.equal(
    (await f.app.inject({ url: f.url, headers: f.headers })).json().items[0].id,
    newest.id,
  );
  const legacy = await f.app.inject({
    url: `${f.root}/${f.change.id}/reviews`,
    headers: f.headers,
  });
  assert.deepEqual(
    legacy.json().map((n: Review) => n.id),
    [...f.notes, newest].map((n) => n.id),
  );
  const empty = await f.app.inject({
    url: `${f.root}/${f.other.id}/reviews/page`,
    headers: f.headers,
  });
  assert.deepEqual(empty.json(), { items: [], nextCursor: null });
});

test('review pages reject malformed queries and cursors bound to other proposals principals and workspaces', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.app.inject({ url: f.url })).statusCode, 401);
  for (const query of [
    'limit=0',
    'limit=101',
    'limit=1.5',
    'limit=',
    'limit=-1',
    'cursor=',
    'cursor=bad',
    'query=x',
    'changeSetId=other',
    'limit=2&limit=3',
  ]) {
    const r = await f.app.inject({ url: `${f.url}?${query}`, headers: f.headers });
    assert.equal(r.statusCode, 400, query);
    assert.equal(r.json().error.code, 'INVALID_INPUT', query);
  }
  const cursor = (await f.app.inject({ url: `${f.url}?limit=1`, headers: f.headers })).json()
    .nextCursor;
  assert.equal(
    (
      await f.app.inject({
        url: `${f.root}/${f.other.id}/reviews/page?cursor=${cursor}`,
        headers: f.headers,
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (
      await f.app.inject({
        url: `${f.url}?cursor=${cursor}`,
        headers: { authorization: `Bearer ${f.identity.token}` },
      })
    ).statusCode,
    400,
  );
  const otherWorkspace = f.service.createWorkspace(operator, 'Other workspace');
  const change = f.service.propose(operator, otherWorkspace.id, {
    title: 'Other',
    operations: [{ path: '/a', baseRevision: null, content: 'x' }],
  });
  assert.equal(
    (
      await f.app.inject({
        url: `/v1/workspaces/${otherWorkspace.id}/changes/${change.id}/reviews/page?cursor=${cursor}`,
        headers: f.headers,
      })
    ).statusCode,
    400,
  );
});

test('each review page rechecks author read authority and peer read plus review authority', async (t) => {
  const f = await fixture(t);
  const get = async (token: string, cursor?: string) =>
    f.app.inject({
      url: `${f.url}?limit=1${cursor ? `&cursor=${cursor}` : ''}`,
      headers: { authorization: `Bearer ${token}` },
    });
  const own = await get(f.identity.token);
  assert.equal(own.statusCode, 200);
  const peer = await get(f.peer.token);
  assert.equal(peer.statusCode, 200);
  f.service.revokeGrant(operator, f.workspace.id, f.peerReview.id);
  const denied = await get(f.peer.token, peer.json().nextCursor);
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.body.includes('Note'), false);
  f.service.revokeGrant(operator, f.workspace.id, f.grant.id);
  assert.equal((await get(f.identity.token, own.json().nextCursor)).statusCode, 403);
  const readOnly = f.service.createGrant(operator, f.workspace.id, {
    agentId: f.principal.id,
    scope: '/drafts',
    actions: ['read'],
    effect: 'allow',
  });
  assert.equal((await get(f.identity.token, own.json().nextCursor)).statusCode, 200);
  f.service.createGrant(operator, f.workspace.id, {
    agentId: f.principal.id,
    scope: '/drafts',
    actions: ['read'],
    effect: 'deny',
  });
  assert.equal((await get(f.identity.token, own.json().nextCursor)).statusCode, 403);
  f.service.revokeAgent(operator, f.workspace.id, f.peer.agent.id);
  assert.equal((await get(f.peer.token, peer.json().nextCursor)).statusCode, 401);
  assert.ok(readOnly.id);
  const third = f.service.createAgent(operator, f.workspace.id, {
    name: 'Expired reviewer',
    domain: 'Drafts',
    provider: 'External',
  });
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  f.service.createGrant(operator, f.workspace.id, {
    agentId: third.agent.id,
    scope: '/drafts',
    actions: ['read', 'review'],
    effect: 'allow',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  });
  assert.equal((await get(third.token)).statusCode, 200);
  t.mock.timers.tick(86400000);
  assert.equal((await get(third.token)).statusCode, 403);
  const foreign = f.service.createWorkspace(operator, 'Foreign');
  const foreignChange = f.service.propose(operator, foreign.id, {
    title: 'Foreign proposal',
    operations: [
      { path: '/drafts/foreign', content: 'Private foreign content', baseRevision: null },
    ],
  });
  assert.equal(
    (
      await f.app.inject({
        url: `/v1/workspaces/${foreign.id}/changes/${foreignChange.id}/reviews/page`,
        headers: { authorization: `Bearer ${f.identity.token}` },
      })
    ).statusCode,
    403,
  );
});

test('real SDK traverses scoped review pages without duplicate notes', async (t) => {
  const f = await fixture(t);
  const baseUrl = await f.app.listen({ host: '127.0.0.1', port: 0 });
  const sdk = new WorkspaceClient({ baseUrl, token: f.peer.token });
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await sdk.reviewPage(f.workspace.id, f.change.id, { limit: 7, cursor });
    ids.push(...page.items.map((n) => n.id));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  assert.deepEqual(
    ids,
    f.notes.toReversed().map((n) => n.id),
  );
  f.service.revokeGrant(operator, f.workspace.id, f.peerRead.id);
  await assert.rejects(
    sdk.reviewPage(f.workspace.id, f.change.id),
    (e) => e instanceof WorkspaceApiError && e.status === 403,
  );
});

test('review pages share one live grant snapshot instead of rereading policy for every note', async (t) => {
  const f = await fixture(t);
  const prepare = t.mock.method(Database.prototype, 'prepare');
  const page = f.service.page(f.reviewer, f.workspace.id, 'reviews', {
    changeSetId: f.change.id,
    limit: 7,
  });
  assert.equal(page.items.length, 7);
  assert.equal(
    prepare.mock.calls.filter(({ arguments: [sql] }) => /\bFROM grants\b/i.test(sql)).length,
    1,
  );
});
