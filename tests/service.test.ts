import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceService } from '../packages/core/src/service.js';
import { operator, type Principal } from '../packages/core/src/types.js';

function fixture(t: { after(fn: () => void): void }) {
  const dir = mkdtempSync(join(tmpdir(), 'afm-test-'));
  const service = new WorkspaceService(join(dir, 'workspace.db'));
  t.after(() => {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const workspace = service.createWorkspace(operator, 'Research lab');
  const identity = service.createAgent(operator, workspace.id, {
    name: 'Writer',
    domain: 'Drafting',
    provider: 'External',
  });
  const agent = service.authenticateAgent(identity.token)!;
  return { service, workspace, agent, identity, dir };
}
function publish(
  service: WorkspaceService,
  wid: string,
  path: string,
  content: string | null,
  baseRevision: string | null = null,
  actor: Principal = operator,
) {
  const change = service.propose(actor, wid, {
    title: 'Update document',
    operations: [{ path, content, baseRevision }],
  });
  service.approve(operator, wid, change.id);
  service.apply(operator, wid, change.id);
  return service.readDocument(operator, wid, path, true);
}
test('unauthorized agents cannot read contents, history, metadata, or other workspaces', (t) => {
  const { service: s, workspace: w, agent: a } = fixture(t);
  publish(s, w.id, '/private/a.md', 'secret');
  assert.deepEqual(s.listDocuments(a, w.id), []);
  assert.throws(() => s.readDocument(a, w.id, '/private/a.md'), { code: 'FORBIDDEN' });
  assert.throws(() => s.history(a, w.id, '/private/a.md'), { code: 'FORBIDDEN' });
  const other = s.createWorkspace(operator, 'Other');
  assert.throws(() => s.listDocuments(a, other.id), { code: 'FORBIDDEN' });
  assert.throws(() => s.overview(a, w.id), { code: 'FORBIDDEN' });
});
test('agent changes require operator approval and are applied with revision history', (t) => {
  const { service: s, workspace: w, agent: a, identity: i } = fixture(t);
  s.createGrant(operator, w.id, {
    agentId: i.agent.id,
    scope: '/drafts',
    actions: ['read', 'write'],
    effect: 'allow',
  });
  const c = s.propose(a, w.id, {
    title: 'Draft',
    operations: [{ path: '/drafts/a.md', baseRevision: null, content: 'hello' }],
  });
  assert.throws(() => s.approve(a, w.id, c.id), { code: 'FORBIDDEN' });
  assert.throws(() => s.apply(operator, w.id, c.id), { code: 'INVALID_STATE' });
  s.approve(operator, w.id, c.id);
  s.apply(operator, w.id, c.id);
  assert.equal(s.readDocument(a, w.id, '/drafts/a.md').content, 'hello');
  assert.equal(s.history(a, w.id, '/drafts/a.md').length, 1);
  assert.throws(() => s.apply(operator, w.id, c.id), { code: 'INVALID_STATE' });
});
test('revoked grants invalidate an already approved proposal', (t) => {
  const { service: s, workspace: w, agent: a, identity: i } = fixture(t);
  const g = s.createGrant(operator, w.id, {
    agentId: i.agent.id,
    scope: '/',
    actions: ['read', 'write'],
    effect: 'allow',
  });
  const c = s.propose(a, w.id, {
    title: 'Draft',
    operations: [{ path: '/a.md', baseRevision: null, content: 'hello' }],
  });
  s.approve(operator, w.id, c.id);
  s.revokeGrant(operator, w.id, g.id);
  assert.throws(() => s.apply(operator, w.id, c.id), { code: 'FORBIDDEN' });
  assert.equal(s.listDocuments(operator, w.id).length, 0);
  assert.throws(() => s.getChange(a, w.id, c.id), { code: 'FORBIDDEN' });
});
test('a conflict rolls back the entire multi-document change set', (t) => {
  const { service: s, workspace: w } = fixture(t);
  const original = publish(s, w.id, '/b.md', 'before');
  const c = s.propose(operator, w.id, {
    title: 'Atomic batch',
    operations: [
      { path: '/a.md', baseRevision: null, content: 'must not exist' },
      { path: '/b.md', baseRevision: original.currentRevision, content: 'stale' },
    ],
  });
  s.approve(operator, w.id, c.id);
  publish(s, w.id, '/b.md', 'concurrent', original.currentRevision);
  assert.throws(() => s.apply(operator, w.id, c.id), { code: 'REVISION_CONFLICT' });
  assert.throws(() => s.readDocument(operator, w.id, '/a.md'), { code: 'NOT_FOUND' });
  assert.equal(s.readDocument(operator, w.id, '/b.md').content, 'concurrent');
  assert.equal(s.getChange(operator, w.id, c.id).status, 'approved');
});
test('deletion creates a tombstone and restoration creates a new revision', (t) => {
  const { service: s, workspace: w } = fixture(t);
  const first = publish(s, w.id, '/a.md', 'original');
  const deleted = publish(s, w.id, '/a.md', null, first.currentRevision);
  assert.equal(s.listDocuments(operator, w.id).length, 0);
  assert.throws(() => s.readDocument(operator, w.id, '/a.md'), { code: 'NOT_FOUND' });
  publish(s, w.id, '/a.md', 'original', deleted.currentRevision);
  assert.equal(s.history(operator, w.id, '/a.md').length, 3);
  assert.equal(s.readDocument(operator, w.id, '/a.md').content, 'original');
});
test('duplicate paths and oversized text are rejected without partial proposals', (t) => {
  const { service: s, workspace: w } = fixture(t);
  assert.throws(
    () =>
      s.propose(operator, w.id, {
        title: 'Duplicates',
        operations: [
          { path: '/a', baseRevision: null, content: '1' },
          { path: '/a', baseRevision: null, content: '2' },
        ],
      }),
    { code: 'INVALID_CHANGE' },
  );
  assert.throws(
    () =>
      s.propose(operator, w.id, {
        title: 'Too big',
        operations: [{ path: '/a', baseRevision: null, content: 'x'.repeat(262145) }],
      }),
    { code: 'CONTENT_TOO_LARGE' },
  );
  assert.equal(s.listChanges(operator, w.id).length, 0);
});
test('task handoff transfers assignment but never transfers file permissions', (t) => {
  const { service: s, workspace: w, agent: a, identity: i } = fixture(t);
  const other = s.createAgent(operator, w.id, {
    name: 'Reviewer',
    domain: 'Review',
    provider: 'External',
  });
  const task = s.createTask(operator, w.id, {
    title: 'Review',
    instructions: 'Read the draft',
    assigneeId: i.agent.id,
  });
  const b = s.authenticateAgent(other.token)!;
  assert.deepEqual(s.listTasks(b, w.id), []);
  s.updateTask(a, w.id, task.id, { assigneeId: other.agent.id, status: 'in_progress' });
  assert.equal(s.listTasks(a, w.id).length, 0);
  assert.equal(s.listTasks(b, w.id).length, 1);
  assert.throws(() => s.readDocument(b, w.id, '/drafts/a.md'), { code: 'FORBIDDEN' });
});
test('revoked agents lose authentication and pending proposal authority', (t) => {
  const { service: s, workspace: w, agent: a, identity: i } = fixture(t);
  s.createGrant(operator, w.id, {
    agentId: i.agent.id,
    scope: '/',
    actions: ['read', 'write'],
    effect: 'allow',
  });
  const c = s.propose(a, w.id, {
    title: 'Draft',
    operations: [{ path: '/a', baseRevision: null, content: 'text' }],
  });
  s.approve(operator, w.id, c.id);
  s.revokeAgent(operator, w.id, i.agent.id);
  assert.equal(s.authenticateAgent(i.token), null);
  assert.throws(() => s.apply(operator, w.id, c.id), { code: 'FORBIDDEN' });
  assert.throws(() => s.listDocuments(a, w.id), { code: 'FORBIDDEN' });
});
test('documents and approvals persist after closing and reopening the database', (t) => {
  const { service: s, workspace: w, dir } = fixture(t);
  publish(s, w.id, '/a', 'persisted');
  s.close();
  const reopened = new WorkspaceService(join(dir, 'workspace.db'));
  try {
    assert.equal(reopened.readDocument(operator, w.id, '/a').content, 'persisted');
  } finally {
    reopened.close();
  }
  assert.equal(statSync(join(dir, 'workspace.db')).mode & 0o777, 0o600);
});
test('ill-formed Unicode cannot change approved content during persistence', (t) => {
  const { service: s, workspace: w } = fixture(t);
  assert.throws(
    () =>
      s.propose(operator, w.id, {
        title: 'Invalid path',
        operations: [{ path: '/a\ud800', baseRevision: null, content: 'valid' }],
      }),
    { code: 'INVALID_PATH' },
  );
  assert.throws(
    () =>
      s.propose(operator, w.id, {
        title: 'Invalid content',
        operations: [{ path: '/a', baseRevision: null, content: 'invalid\ud800text' }],
      }),
    { code: 'INVALID_CONTENT' },
  );
  assert.equal(s.listChanges(operator, w.id).length, 0);
});
