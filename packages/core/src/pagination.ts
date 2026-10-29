import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  DomainError,
  type Action,
  type Collection,
  type Collections,
  type Page,
  type PageOptions,
  type Principal,
} from './types.js';

const columns: Record<Collection, { table: string; select: string }> = {
  documents: { table: 'documents', select: 'workspaceId,path,currentRevision,deleted,updatedAt' },
  changes: {
    table: 'changes',
    select:
      "id,workspaceId,title,authorId,digest,approvedDigest,status,createdAt,approvedAt,appliedAt,json_array_length(operations) AS operationCount,(SELECT json_group_array(json_extract(value,'$.path')) FROM json_each(operations)) AS paths",
  },
  history: {
    table: 'revisions',
    select: 'id,workspaceId,path,deleted,parentId,authorId,changeSetId,createdAt',
  },
  agents: { table: 'agents', select: 'id,workspaceId,name,domain,provider,revokedAt,createdAt' },
  grants: {
    table: 'grants',
    select: 'id,workspaceId,agentId,scope,actions,effect,expiresAt,revokedAt,createdAt',
  },
  tasks: {
    table: 'tasks',
    select: 'id,workspaceId,title,instructions,assigneeId,status,createdAt,updatedAt',
  },
  activity: {
    table: 'activity',
    select: 'id,workspaceId,actorId,action,resourceId,metadata,createdAt',
  },
};
const invalid = (): never => {
  throw new DomainError('INVALID_INPUT', 'Invalid page options or cursor context.');
};

export function validatePageOptions(collection: Collection, options: PageOptions): void {
  if (!(collection in columns)) invalid();
  const permitted = [
    'limit',
    'cursor',
    ...(collection === 'documents' ? ['query', 'includeDeleted'] : []),
    ...(collection === 'changes' ? ['status'] : []),
    ...(collection === 'history' ? ['path'] : []),
  ];
  if (Object.entries(options).some(([k, v]) => v !== undefined && !permitted.includes(k)))
    invalid();
  if (
    options.limit !== undefined &&
    (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 100)
  )
    invalid();
  if (
    options.query !== undefined &&
    (typeof options.query !== 'string' ||
      !options.query.isWellFormed() ||
      options.query.length > 512)
  )
    invalid();
  if (options.includeDeleted !== undefined && typeof options.includeDeleted !== 'boolean')
    invalid();
  if (
    options.status !== undefined &&
    !['pending', 'approved', 'applied', 'rejected'].includes(options.status)
  )
    invalid();
  if (collection === 'history' && typeof options.path !== 'string') invalid();
}

export function readPage<K extends Collection>(
  db: Database.Database,
  principal: Principal,
  workspaceId: string,
  collection: K,
  options: PageOptions,
  can: (action: Action, path: string) => boolean,
): Page<Collections[K]> {
  validatePageOptions(collection, options);
  const { table, select } = columns[collection];
  const context = createHash('sha256')
    .update(
      JSON.stringify([
        workspaceId,
        principal.kind,
        principal.id,
        collection,
        options.query ?? '',
        options.status ?? '',
        options.path ?? '',
        options.includeDeleted ?? false,
      ]),
    )
    .digest('hex');
  const where = ['workspaceId=?'];
  const values: (string | number)[] = [workspaceId];
  if (collection === 'documents') {
    if (!options.includeDeleted) where.push('deleted=0');
    if (options.query) {
      where.push('instr(lower(path),lower(?))>0');
      values.push(options.query);
    }
  }
  if (collection === 'changes') {
    if (options.status) {
      where.push('status=?');
      values.push(options.status);
    }
    if (principal.kind === 'agent') {
      where.push('authorId=?');
      values.push(principal.id);
    }
  }
  if (collection === 'history') {
    where.push('path=?');
    values.push(options.path!);
  }
  if (collection === 'tasks' && principal.kind === 'agent') {
    where.push('assigneeId=?');
    values.push(principal.id);
  }
  return db.transaction(() => {
    let upper: number;
    let after: number;
    if (options.cursor !== undefined) {
      try {
        if (!/^[A-Za-z0-9_-]{1,1024}$/.test(options.cursor)) invalid();
        const c = JSON.parse(Buffer.from(options.cursor, 'base64url').toString('utf8'));
        if (
          c.v !== 1 ||
          c.context !== context ||
          !Number.isSafeInteger(c.upper) ||
          !Number.isSafeInteger(c.after) ||
          c.upper < 0 ||
          c.upper >= Number.MAX_SAFE_INTEGER ||
          c.after < 1 ||
          c.after > c.upper + 1
        )
          invalid();
        upper = c.upper;
        after = c.after;
      } catch {
        invalid();
      }
    } else {
      upper = (
        db
          .prepare(`SELECT COALESCE(MAX(rowid),0) AS n FROM ${table} WHERE workspaceId=?`)
          .get(workspaceId) as { n: number }
      ).n;
      after = upper + 1;
    }
    const rows = db
      .prepare(
        `SELECT rowid AS sequence,${select} FROM ${table} WHERE ${where.join(' AND ')} AND rowid<=? AND rowid<? ORDER BY rowid DESC LIMIT 500`,
      )
      .all(...values, upper!, after!) as Record<string, unknown>[];
    const items: Collections[K][] = [];
    let last = after!;
    for (const row of rows) {
      last = row.sequence as number;
      const { sequence: _sequence, paths, ...item } = row;
      if (collection === 'documents' && !can('read', item.path as string)) continue;
      if (
        collection === 'changes' &&
        !(JSON.parse(paths as string) as string[]).every((path) => can('read', path))
      )
        continue;
      if ('deleted' in item) item.deleted = Boolean(item.deleted);
      for (const key of ['actions', 'metadata'])
        if (typeof item[key] === 'string') item[key] = JSON.parse(item[key]);
      items.push(item as unknown as Collections[K]);
      if (items.length === (options.limit ?? 25)) break;
    }
    const more =
      rows.length > 0 &&
      Boolean(
        db
          .prepare(
            `SELECT 1 FROM ${table} WHERE ${where.join(' AND ')} AND rowid<=? AND rowid<? LIMIT 1`,
          )
          .get(...values, upper!, last),
      );
    return {
      items,
      nextCursor: more
        ? Buffer.from(JSON.stringify({ v: 1, context, upper: upper!, after: last })).toString(
            'base64url',
          )
        : null,
    };
  })();
}
