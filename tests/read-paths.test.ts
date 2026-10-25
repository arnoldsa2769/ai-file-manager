import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { WorkspaceService } from '../packages/core/src/service.js';
import { operator, type Operation } from '../packages/core/src/types.js';

function fixture(t: TestContext) {
  const service = new WorkspaceService(':memory:');
  t.after(() => service.close());
  const workspace = service.createWorkspace(operator, 'Read path tests');
  const identity = service.createAgent(operator, workspace.id, {
    name: 'Writer',
    domain: 'Drafts',
    provider: 'External',
  });
  const agent = service.authenticateAgent(identity.token)!;
  const grant = service.createGrant(operator, workspace.id, {
    agentId: agent.id,
    scope: '/drafts',
    actions: ['read', 'write', 'review'],
    effect: 'allow',
  });
  const operations: Operation[] = Array.from({ length: 20 }, (_, index) => ({
    path: `/drafts/${index}.md`,
    baseRevision: null,
    content: `Draft ${index}`,
  }));
  return { service, workspace, agent, identity, grant, operations };
}

function grantQueries(t: TestContext) {
  // Spy on real SQLite preparation; all statements still run against the real database.
  const prepare = t.mock.method(Database.prototype, 'prepare');
  return {
    count: () =>
      prepare.mock.calls.filter(({ arguments: [sql] }) => /\bFROM grants\b/i.test(sql)).length,
    reset: () => prepare.mock.resetCalls(),
  };
}

test('document listings use a constant grant-query budget while preserving scope and deny rules', (t) => {
  const { service: s, workspace: w, agent: a, operations } = fixture(t);
  const initial = s.propose(operator, w.id, { title: 'Twenty documents', operations });
  s.approve(operator, w.id, initial.id);
  s.apply(operator, w.id, initial.id);
  const hidden = s.propose(operator, w.id, {
    title: 'Hidden domains',
    operations: [
      { path: '/drafts/private/secret.md', baseRevision: null, content: 'Denied' },
      { path: '/drafts-private/secret.md', baseRevision: null, content: 'Neighbor' },
    ],
  });
  s.approve(operator, w.id, hidden.id);
  s.apply(operator, w.id, hidden.id);
  s.createGrant(operator, w.id, {
    agentId: a.id,
    scope: '/drafts/private',
    actions: ['read'],
    effect: 'deny',
  });
  const queries = grantQueries(t);
  const documents = s.listDocuments(a, w.id);
  assert.equal(documents.length, 20);
  assert.equal(
    documents.some((doc) => doc.content === 'Denied' || doc.content === 'Neighbor'),
    false,
  );
  assert.equal(queries.count(), 1, 'Grant reads must not grow with document count.');
  queries.reset();
  assert.equal(s.listDocuments(operator, w.id).length, 22);
  assert.equal(queries.count(), 0, 'The operator does not need agent grant reads.');
});

test('owned proposal listings load grants once and immediately observe read revocation', (t) => {
  const { service: s, workspace: w, agent: a, operations, grant } = fixture(t);
  for (const operation of operations)
    s.propose(a, w.id, { title: operation.path, operations: [operation] });
  s.propose(operator, w.id, { title: 'Operator proposal', operations: [operations[0]!] });
  const queries = grantQueries(t);
  const changes = s.listChanges(a, w.id);
  assert.equal(changes.length, 20);
  assert.ok(changes.every((change) => change.authorId === a.id));
  assert.equal(queries.count(), 1, 'Grant reads must not grow with proposal count.');
  s.revokeGrant(operator, w.id, grant.id);
  queries.reset();
  assert.deepEqual(s.listChanges(a, w.id), []);
  assert.equal(queries.count(), 1, 'A new request must reload revoked permissions.');
});

test('batch proposals, reviewer inspection, and apply each read current grants once', (t) => {
  const { service: s, workspace: w, agent: a, operations } = fixture(t);
  const queries = grantQueries(t);
  const change = s.propose(a, w.id, { title: 'Batch proposal', operations });
  assert.equal(change.operations.length, 20);
  assert.equal(queries.count(), 1, 'Read/write checks must share one grant query.');
  queries.reset();
  assert.equal(s.getChange(a, w.id, change.id).id, change.id);
  assert.equal(queries.count(), 1);
  const reviewer = s.createAgent(operator, w.id, {
    name: 'Reviewer',
    domain: 'Review',
    provider: 'External',
  });
  const reviewPrincipal = s.authenticateAgent(reviewer.token)!;
  s.createGrant(operator, w.id, {
    agentId: reviewPrincipal.id,
    scope: '/drafts',
    actions: ['read', 'review'],
    effect: 'allow',
  });
  queries.reset();
  assert.equal(s.getChange(reviewPrincipal, w.id, change.id).operations.length, 20);
  assert.equal(queries.count(), 1, 'Review/read checks must share one grant query.');
  queries.reset();
  const review = s.addReview(reviewPrincipal, w.id, change.id, 'Reviewed all twenty drafts.');
  assert.equal(review.authorId, reviewPrincipal.id);
  assert.equal(queries.count(), 1, 'Adding a review must share the same authorization snapshot.');
  s.approve(operator, w.id, change.id);
  queries.reset();
  s.apply(operator, w.id, change.id);
  assert.equal(queries.count(), 1, 'Apply must load fresh author grants inside its transaction.');
  assert.equal(s.listDocuments(operator, w.id).length, 20);
});

test('request-local permissions expire and newly denied approved changes remain atomic', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-01-01T00:00:00Z') });
  const { service: s, workspace: w, agent: a, operations, grant } = fixture(t);
  s.revokeGrant(operator, w.id, grant.id);
  s.createGrant(operator, w.id, {
    agentId: a.id,
    scope: '/drafts',
    actions: ['read', 'write'],
    effect: 'allow',
    expiresAt: '2026-01-02T00:00:00Z',
  });
  const change = s.propose(a, w.id, { title: 'Expiring batch', operations });
  assert.equal(s.listChanges(a, w.id).length, 1);
  s.approve(operator, w.id, change.id);
  const deny = s.createGrant(operator, w.id, {
    agentId: a.id,
    scope: '/drafts/19.md',
    actions: ['write'],
    effect: 'deny',
  });
  assert.throws(() => s.apply(operator, w.id, change.id), { code: 'FORBIDDEN' });
  assert.equal(s.listDocuments(operator, w.id).length, 0);
  s.revokeGrant(operator, w.id, deny.id);
  t.mock.timers.tick(86_400_000);
  assert.deepEqual(s.listChanges(a, w.id), []);
  assert.throws(() => s.apply(operator, w.id, change.id), { code: 'FORBIDDEN' });
  assert.equal(s.getChange(operator, w.id, change.id).status, 'approved');
  assert.equal(s.listDocuments(operator, w.id).length, 0);
});
