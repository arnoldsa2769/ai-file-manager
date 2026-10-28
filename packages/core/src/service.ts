import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { openDatabase } from './database.js';
import { allowed, canonicalPath } from './policy.js';
import { idempotent } from './idempotency.js';
import { readPage, validatePageOptions } from './pagination.js';
import {
  DomainError,
  type Action,
  type Activity,
  type Agent,
  type ChangeSet,
  type Document,
  type Grant,
  type Operation,
  type Overview,
  type Principal,
  type Review,
  type Revision,
  type Task,
  type Workspace,
  type WorkspaceSummary,
  type Collection,
  type Collections,
  type Page,
  type PageOptions,
} from './types.js';

const now = () => new Date().toISOString();
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const agentColumns = 'id, workspaceId, name, domain, provider, revokedAt, createdAt';
type AccessCheck = (action: Action, path: string) => boolean;
function fail(code: string, message: string, status = 400): never {
  throw new DomainError(code, message, status);
}
function text(value: string, name: string, limit: number): string {
  if (typeof value !== 'string' || !value.isWellFormed() || !value.trim() || value.length > limit)
    fail('INVALID_INPUT', `${name} must contain 1-${limit} characters.`);
  return value.trim();
}
function decode<T>(row: unknown): T {
  const result = { ...(row as Record<string, unknown>) };
  for (const key of ['actions', 'operations', 'metadata'])
    if (typeof result[key] === 'string') result[key] = JSON.parse(result[key]);
  if ('deleted' in result) result.deleted = Boolean(result.deleted);
  return result as T;
}
export class WorkspaceService {
  private readonly db: Database.Database;
  constructor(path: string) {
    this.db = openDatabase(path);
  }
  close(): void {
    if (this.db.open) this.db.close();
  }
  private one<T>(sql: string, ...args: unknown[]): T | undefined {
    const row = this.db.prepare(sql).get(...args);
    return row ? decode<T>(row) : undefined;
  }
  private all<T>(sql: string, ...args: unknown[]): T[] {
    return this.db
      .prepare(sql)
      .all(...args)
      .map((row) => decode<T>(row));
  }
  private insert(table: string, item: object): void {
    const entries = Object.entries(item);
    this.db
      .prepare(
        `INSERT INTO ${table} (${entries.map(([key]) => key).join(',')}) VALUES (${entries.map(() => '?').join(',')})`,
      )
      .run(
        ...entries.map(([, value]) =>
          typeof value === 'boolean'
            ? Number(value)
            : typeof value === 'object' && value !== null
              ? JSON.stringify(value)
              : value,
        ),
      );
  }
  private record(
    p: Principal,
    wid: string,
    action: string,
    resourceId: string,
    metadata: Record<string, unknown> = {},
  ): void {
    this.insert('activity', {
      id: randomUUID(),
      workspaceId: wid,
      actorId: p.id,
      action,
      resourceId,
      metadata,
      createdAt: now(),
    });
  }
  private admin(p: Principal): void {
    if (p.kind !== 'operator')
      fail('FORBIDDEN', 'This operation requires the workspace operator.', 403);
  }
  private workspace(p: Principal, wid: string): Workspace {
    if (p.kind === 'agent') {
      if (p.workspaceId !== wid) fail('FORBIDDEN', 'Access denied.', 403);
      this.activeAgent(wid, p.id);
    }
    return (
      this.one<Workspace>('SELECT * FROM workspaces WHERE id=?', wid) ??
      fail('NOT_FOUND', 'Workspace not found.', 404)
    );
  }
  private activeAgent(wid: string, id: string): Agent {
    const agent = this.one<Agent>(
      `SELECT ${agentColumns} FROM agents WHERE id=? AND workspaceId=?`,
      id,
      wid,
    );
    if (!agent || agent.revokedAt) fail('FORBIDDEN', 'Agent is unavailable or revoked.', 403);
    return agent;
  }
  private grants(wid: string, agentId: string): Grant[] {
    return this.all<Grant>('SELECT * FROM grants WHERE workspaceId=? AND agentId=?', wid, agentId);
  }
  private access(p: Principal, wid: string): AccessCheck {
    if (p.kind === 'operator') return () => true;
    const grants = this.grants(wid, p.id);
    const evaluatedAt = new Date();
    return (action, path) => allowed(grants, action, path, evaluatedAt);
  }
  private require(can: AccessCheck, action: Action, path: string): void {
    if (!can(action, path))
      fail('FORBIDDEN', 'The requested document operation is not permitted.', 403);
  }
  authenticateAgent(token: string): Principal | null {
    const agent = this.one<Agent>(
      'SELECT * FROM agents WHERE tokenHash=? AND revokedAt IS NULL',
      hash(token),
    );
    return agent ? { kind: 'agent', id: agent.id, workspaceId: agent.workspaceId } : null;
  }
  createWorkspace(p: Principal, name: string): Workspace {
    this.admin(p);
    const workspace = {
      id: randomUUID(),
      name: text(name, 'Workspace name', 100),
      createdAt: now(),
    };
    this.db.transaction(() => {
      this.insert('workspaces', workspace);
      this.record(p, workspace.id, 'workspace.created', workspace.id);
    })();
    return workspace;
  }
  listWorkspaces(p: Principal): Workspace[] {
    this.admin(p);
    return this.all('SELECT * FROM workspaces ORDER BY createdAt DESC');
  }
  createAgent(
    p: Principal,
    wid: string,
    input: { name: string; domain: string; provider: string },
  ): { agent: Agent; token: string } {
    this.admin(p);
    this.workspace(p, wid);
    const token = 'afm_' + randomBytes(32).toString('hex');
    const agent: Agent = {
      id: randomUUID(),
      workspaceId: wid,
      name: text(input.name, 'Agent name', 100),
      domain: text(input.domain, 'Domain', 100),
      provider: text(input.provider, 'Provider', 100),
      revokedAt: null,
      createdAt: now(),
    };
    this.db.transaction(() => {
      this.insert('agents', { ...agent, tokenHash: hash(token) });
      this.record(p, wid, 'agent.created', agent.id);
    })();
    return { agent, token };
  }
  revokeAgent(p: Principal, wid: string, id: string): void {
    this.admin(p);
    this.workspace(p, wid);
    this.activeAgent(wid, id);
    this.db.transaction(() => {
      this.db.prepare('UPDATE agents SET revokedAt=? WHERE id=?').run(now(), id);
      this.record(p, wid, 'agent.revoked', id);
    })();
  }
  createGrant(
    p: Principal,
    wid: string,
    input: {
      agentId: string;
      scope: string;
      actions: Action[];
      effect: 'allow' | 'deny';
      expiresAt?: string | null;
    },
  ): Grant {
    this.admin(p);
    this.workspace(p, wid);
    this.activeAgent(wid, input.agentId);
    canonicalPath(input.scope, true);
    if (
      !input.actions.length ||
      input.actions.some((a) => !['read', 'write', 'delete', 'review'].includes(a)) ||
      !['allow', 'deny'].includes(input.effect)
    )
      fail('INVALID_GRANT', 'Invalid grant actions or effect.');
    if (
      input.expiresAt &&
      (!Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= Date.now())
    )
      fail('INVALID_GRANT', 'Expiration must be a future timestamp.');
    const grant: Grant = {
      id: randomUUID(),
      workspaceId: wid,
      agentId: input.agentId,
      scope: input.scope,
      actions: [...new Set(input.actions)],
      effect: input.effect,
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
      createdAt: now(),
    };
    this.db.transaction(() => {
      this.insert('grants', grant);
      this.record(p, wid, 'grant.created', grant.id, {
        agentId: grant.agentId,
        scope: grant.scope,
        actions: grant.actions,
        effect: grant.effect,
      });
    })();
    return grant;
  }
  revokeGrant(p: Principal, wid: string, id: string): void {
    this.admin(p);
    this.workspace(p, wid);
    if (!this.one('SELECT id FROM grants WHERE id=? AND workspaceId=?', id, wid))
      fail('NOT_FOUND', 'Grant not found.', 404);
    this.db.transaction(() => {
      this.db.prepare('UPDATE grants SET revokedAt=? WHERE id=?').run(now(), id);
      this.record(p, wid, 'grant.revoked', id);
    })();
  }
  listDocuments(p: Principal, wid: string): Document[] {
    this.workspace(p, wid);
    const can = this.access(p, wid);
    return this.all<Document>(
      'SELECT * FROM documents WHERE workspaceId=? AND deleted=0 ORDER BY path',
      wid,
    ).filter((d) => can('read', d.path));
  }
  readDocument(p: Principal, wid: string, path: string, includeDeleted = false): Document {
    this.workspace(p, wid);
    canonicalPath(path);
    this.require(this.access(p, wid), 'read', path);
    const doc = this.one<Document>(
      'SELECT * FROM documents WHERE workspaceId=? AND path=?',
      wid,
      path,
    );
    if (!doc || (doc.deleted && !includeDeleted)) fail('NOT_FOUND', 'Document not found.', 404);
    return doc;
  }
  history(p: Principal, wid: string, path: string): Revision[] {
    this.workspace(p, wid);
    canonicalPath(path);
    this.require(this.access(p, wid), 'read', path);
    return this.all<Revision>(
      'SELECT * FROM revisions WHERE workspaceId=? AND path=? ORDER BY rowid DESC',
      wid,
      path,
    );
  }
  revision(p: Principal, wid: string, path: string, revisionId: string): Revision {
    this.workspace(p, wid);
    canonicalPath(path);
    this.require(this.access(p, wid), 'read', path);
    const id = text(revisionId, 'Revision ID', 200);
    if (id !== revisionId)
      fail('INVALID_INPUT', 'Revision ID must not have surrounding whitespace.');
    return (
      this.one<Revision>(
        'SELECT * FROM revisions WHERE workspaceId=? AND path=? AND id=?',
        wid,
        path,
        id,
      ) ?? fail('NOT_FOUND', 'Revision not found for this document.', 404)
    );
  }
  private authorizeOperations(p: Principal, wid: string, operations: Operation[]): void {
    this.workspace(p, wid);
    const can = this.access(p, wid);
    for (const op of operations) {
      this.require(can, 'read', op.path);
      this.require(can, op.content === null ? 'delete' : 'write', op.path);
    }
  }
  propose(
    p: Principal,
    wid: string,
    input: { title: string; operations: Operation[] },
    key?: string,
  ): ChangeSet {
    this.workspace(p, wid);
    const title = text(input.title, 'Change title', 200);
    if (
      !Array.isArray(input.operations) ||
      input.operations.length < 1 ||
      input.operations.length > 20
    )
      fail('INVALID_CHANGE', 'Provide 1-20 document operations.');
    const seen = new Set<string>();
    const operations = input.operations.map((op) => {
      canonicalPath(op.path);
      if (
        seen.has(op.path) ||
        (op.baseRevision !== null && typeof op.baseRevision !== 'string') ||
        (op.content !== null && typeof op.content !== 'string')
      )
        fail('INVALID_CHANGE', 'Duplicate paths or invalid operations.');
      if (op.content !== null && !op.content.isWellFormed())
        fail('INVALID_CONTENT', 'Document content must be well-formed Unicode.');
      if (op.content !== null && Buffer.byteLength(op.content, 'utf8') > 262144)
        fail('CONTENT_TOO_LARGE', 'Document exceeds 256 KiB.');
      seen.add(op.path);
      return { path: op.path, baseRevision: op.baseRevision, content: op.content };
    });
    this.authorizeOperations(p, wid, operations);
    return idempotent(this.db, p, wid, key, 'propose', { title, operations }, () => {
      const change: ChangeSet = {
        id: randomUUID(),
        workspaceId: wid,
        title,
        authorId: p.id,
        operations,
        digest: hash(JSON.stringify({ title, authorId: p.id, operations })),
        approvedDigest: null,
        status: 'pending',
        createdAt: now(),
        approvedAt: null,
        appliedAt: null,
      };
      this.db.transaction(() => {
        this.insert('changes', change);
        this.record(p, wid, 'change.proposed', change.id, { paths: operations.map((o) => o.path) });
      })();
      return change;
    });
  }
  private rawChange(wid: string, id: string): ChangeSet {
    return (
      this.one<ChangeSet>('SELECT * FROM changes WHERE id=? AND workspaceId=?', id, wid) ??
      fail('NOT_FOUND', 'Change set not found.', 404)
    );
  }
  getChange(p: Principal, wid: string, id: string): ChangeSet {
    return this.inspectChange(p, wid, id);
  }
  private inspectChange(p: Principal, wid: string, id: string, review = false): ChangeSet {
    this.workspace(p, wid);
    const change = this.rawChange(wid, id);
    const can = this.access(p, wid);
    if (review || (p.kind === 'agent' && change.authorId !== p.id)) {
      for (const op of change.operations) this.require(can, 'review', op.path);
    }
    for (const op of change.operations) this.require(can, 'read', op.path);
    return change;
  }
  listChanges(p: Principal, wid: string): ChangeSet[] {
    this.workspace(p, wid);
    const can = this.access(p, wid);
    return this.all<ChangeSet>(
      'SELECT * FROM changes WHERE workspaceId=? ORDER BY rowid DESC',
      wid,
    ).filter(
      (c) =>
        p.kind === 'operator' ||
        (c.authorId === p.id && c.operations.every((op) => can('read', op.path))),
    );
  }
  approve(p: Principal, wid: string, id: string): ChangeSet {
    this.admin(p);
    this.workspace(p, wid);
    const change = this.rawChange(wid, id);
    if (change.status !== 'pending')
      fail('INVALID_STATE', 'Only pending changes can be approved.', 409);
    this.db.transaction(() => {
      this.db
        .prepare('UPDATE changes SET status=?,approvedDigest=?,approvedAt=? WHERE id=?')
        .run('approved', change.digest, now(), id);
      this.record(p, wid, 'change.approved', id, { digest: change.digest });
    })();
    return this.rawChange(wid, id);
  }
  reject(p: Principal, wid: string, id: string): ChangeSet {
    this.admin(p);
    this.workspace(p, wid);
    const c = this.rawChange(wid, id);
    if (!['pending', 'approved'].includes(c.status))
      fail('INVALID_STATE', 'This change is already finalized.', 409);
    this.db.transaction(() => {
      this.db.prepare('UPDATE changes SET status=? WHERE id=?').run('rejected', id);
      this.record(p, wid, 'change.rejected', id);
    })();
    return this.rawChange(wid, id);
  }
  apply(p: Principal, wid: string, id: string, key?: string): ChangeSet {
    this.admin(p);
    this.workspace(p, wid);
    return idempotent(this.db, p, wid, key, 'apply', { id }, () =>
      this.db
        .transaction(() => {
          const change = this.rawChange(wid, id);
          if (change.status !== 'approved')
            fail('INVALID_STATE', 'Approve the change before applying it.', 409);
          const digest = hash(
            JSON.stringify({
              title: change.title,
              authorId: change.authorId,
              operations: change.operations,
            }),
          );
          if (digest !== change.digest || digest !== change.approvedDigest)
            fail('APPROVAL_MISMATCH', 'Approved content no longer matches this change.', 409);
          const author: Principal =
            change.authorId === 'operator'
              ? { kind: 'operator', id: 'operator' }
              : { kind: 'agent', id: change.authorId, workspaceId: wid };
          this.authorizeOperations(author, wid, change.operations);
          for (const op of change.operations) {
            const current = this.one<Document>(
              'SELECT * FROM documents WHERE workspaceId=? AND path=?',
              wid,
              op.path,
            );
            if ((current?.currentRevision ?? null) !== op.baseRevision)
              fail('REVISION_CONFLICT', `Document changed since proposal: ${op.path}`, 409);
            if (op.content === null && (!current || current.deleted))
              fail('INVALID_CHANGE', 'Cannot delete an absent document.');
          }
          const createdAt = now();
          for (const op of change.operations) {
            const revision: Revision = {
              id: randomUUID(),
              workspaceId: wid,
              path: op.path,
              content: op.content,
              deleted: op.content === null,
              parentId: op.baseRevision,
              authorId: change.authorId,
              changeSetId: id,
              createdAt,
            };
            this.insert('revisions', revision);
            this.db
              .prepare(
                'INSERT INTO documents (workspaceId,path,currentRevision,content,deleted,updatedAt) VALUES (?,?,?,?,?,?) ON CONFLICT(workspaceId,path) DO UPDATE SET currentRevision=excluded.currentRevision,content=excluded.content,deleted=excluded.deleted,updatedAt=excluded.updatedAt',
              )
              .run(wid, op.path, revision.id, op.content, Number(revision.deleted), createdAt);
          }
          this.db
            .prepare('UPDATE changes SET status=?,appliedAt=? WHERE id=?')
            .run('applied', createdAt, id);
          this.record(p, wid, 'change.applied', id, {
            digest,
            paths: change.operations.map((o) => o.path),
          });
          return this.rawChange(wid, id);
        })
        .immediate(),
    );
  }
  addReview(p: Principal, wid: string, id: string, body: string): Review {
    this.inspectChange(p, wid, id, true);
    const review: Review = {
      id: randomUUID(),
      workspaceId: wid,
      changeSetId: id,
      authorId: p.id,
      body: text(body, 'Review', 4000),
      createdAt: now(),
    };
    this.db.transaction(() => {
      this.insert('reviews', review);
      this.record(p, wid, 'review.added', id);
    })();
    return review;
  }
  listReviews(p: Principal, wid: string, id: string): Review[] {
    this.getChange(p, wid, id);
    return this.all(
      'SELECT * FROM reviews WHERE workspaceId=? AND changeSetId=? ORDER BY rowid',
      wid,
      id,
    );
  }
  createTask(
    p: Principal,
    wid: string,
    input: { title: string; instructions: string; assigneeId: string },
  ): Task {
    this.admin(p);
    this.workspace(p, wid);
    this.activeAgent(wid, input.assigneeId);
    const task: Task = {
      id: randomUUID(),
      workspaceId: wid,
      title: text(input.title, 'Task title', 200),
      instructions: text(input.instructions, 'Instructions', 8000),
      assigneeId: input.assigneeId,
      status: 'open',
      createdAt: now(),
      updatedAt: now(),
    };
    this.db.transaction(() => {
      this.insert('tasks', task);
      this.record(p, wid, 'task.created', task.id, { assigneeId: task.assigneeId });
    })();
    return task;
  }
  listTasks(p: Principal, wid: string): Task[] {
    this.workspace(p, wid);
    return this.all<Task>(
      'SELECT * FROM tasks WHERE workspaceId=? ORDER BY rowid DESC',
      wid,
    ).filter((task) => p.kind === 'operator' || task.assigneeId === p.id);
  }
  updateTask(
    p: Principal,
    wid: string,
    id: string,
    input: { assigneeId?: string; status?: Task['status'] },
  ): Task {
    this.workspace(p, wid);
    const task =
      this.one<Task>('SELECT * FROM tasks WHERE id=? AND workspaceId=?', id, wid) ??
      fail('NOT_FOUND', 'Task not found.', 404);
    if (p.kind === 'agent' && task.assigneeId !== p.id)
      fail('FORBIDDEN', 'Only the assignee or operator can update this task.', 403);
    if (input.status && !['open', 'in_progress', 'done'].includes(input.status))
      fail('INVALID_INPUT', 'Invalid task status.');
    const assigneeId = input.assigneeId ?? task.assigneeId;
    this.activeAgent(wid, assigneeId);
    this.db.transaction(() => {
      this.db
        .prepare('UPDATE tasks SET assigneeId=?,status=?,updatedAt=? WHERE id=?')
        .run(assigneeId, input.status ?? task.status, now(), id);
      this.record(p, wid, 'task.updated', id, { assigneeId, status: input.status ?? task.status });
    })();
    return this.one<Task>('SELECT * FROM tasks WHERE id=?', id)!;
  }
  summary(p: Principal, wid: string): WorkspaceSummary {
    this.admin(p);
    const workspace = this.workspace(p, wid);
    const count = (table: string, filter = '') =>
      this.one<{ n: number }>(
        `SELECT COUNT(*) AS n FROM ${table} WHERE workspaceId=? ${filter}`,
        wid,
      )!.n;
    return {
      workspace,
      counts: {
        documents: count('documents', 'AND deleted=0'),
        activeAgents: count('agents', 'AND revokedAt IS NULL'),
        pendingChanges: count('changes', "AND status IN ('pending','approved')"),
        tasks: count('tasks'),
      },
    };
  }
  page<K extends Collection>(
    p: Principal,
    wid: string,
    collection: K,
    options: PageOptions = {},
  ): Page<Collections[K]> {
    this.workspace(p, wid);
    if (['agents', 'grants', 'activity'].includes(collection)) this.admin(p);
    validatePageOptions(collection, options);
    const can = this.access(p, wid);
    if (collection === 'history') {
      canonicalPath(options.path!);
      this.require(can, 'read', options.path!);
    }
    return readPage(this.db, p, wid, collection, options, can);
  }
  overview(p: Principal, wid: string): Overview {
    this.admin(p);
    const workspace = this.workspace(p, wid);
    return {
      workspace,
      agents: this.all<Agent>(
        `SELECT ${agentColumns} FROM agents WHERE workspaceId=? ORDER BY createdAt`,
        wid,
      ),
      grants: this.all('SELECT * FROM grants WHERE workspaceId=? ORDER BY rowid DESC', wid),
      documents: this.all('SELECT * FROM documents WHERE workspaceId=? ORDER BY path', wid),
      changes: this.listChanges(p, wid),
      tasks: this.listTasks(p, wid),
      activity: this.all<Activity>(
        'SELECT * FROM activity WHERE workspaceId=? ORDER BY rowid DESC LIMIT 200',
        wid,
      ),
    };
  }
}
