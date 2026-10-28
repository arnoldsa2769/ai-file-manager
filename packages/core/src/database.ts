import Database from 'better-sqlite3';
import { chmodSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

export function openDatabase(path: string): Database.Database {
  if (path !== ':memory:') {
    const directory = dirname(path);
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
    if ((statSync(directory).mode & 0o077) !== 0)
      throw new Error(
        'Database directory must be private (mode 0700). Choose a dedicated data directory.',
      );
  }
  const db = new Database(path);
  if (path !== ':memory:') chmodSync(path, 0o600);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  const version = db.pragma('user_version', { simple: true }) as number;
  if (version > 2) {
    db.close();
    throw new Error('Database schema is newer than this application.');
  }
  if (version === 0)
    db.transaction(() => {
      db.exec(`
      CREATE TABLE workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, createdAt TEXT NOT NULL);
      CREATE TABLE agents (id TEXT PRIMARY KEY, workspaceId TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL, domain TEXT NOT NULL, provider TEXT NOT NULL, tokenHash TEXT UNIQUE NOT NULL, revokedAt TEXT, createdAt TEXT NOT NULL);
      CREATE INDEX agents_workspace ON agents(workspaceId);
      CREATE TABLE grants (id TEXT PRIMARY KEY, workspaceId TEXT NOT NULL REFERENCES workspaces(id), agentId TEXT NOT NULL REFERENCES agents(id), scope TEXT NOT NULL, actions TEXT NOT NULL CHECK(json_valid(actions)), effect TEXT NOT NULL CHECK(effect IN ('allow','deny')), expiresAt TEXT, revokedAt TEXT, createdAt TEXT NOT NULL);
      CREATE INDEX grants_agent ON grants(workspaceId,agentId);
      CREATE TABLE changes (id TEXT PRIMARY KEY, workspaceId TEXT NOT NULL REFERENCES workspaces(id), title TEXT NOT NULL, authorId TEXT NOT NULL, operations TEXT NOT NULL CHECK(json_valid(operations)), digest TEXT NOT NULL, approvedDigest TEXT, status TEXT NOT NULL CHECK(status IN ('pending','approved','applied','rejected')), createdAt TEXT NOT NULL, approvedAt TEXT, appliedAt TEXT);
      CREATE TABLE revisions (id TEXT PRIMARY KEY, workspaceId TEXT NOT NULL REFERENCES workspaces(id), path TEXT NOT NULL, content TEXT, deleted INTEGER NOT NULL, parentId TEXT REFERENCES revisions(id), authorId TEXT NOT NULL, changeSetId TEXT NOT NULL REFERENCES changes(id), createdAt TEXT NOT NULL);
      CREATE INDEX revisions_document ON revisions(workspaceId,path,createdAt);
      CREATE TABLE documents (workspaceId TEXT NOT NULL REFERENCES workspaces(id), path TEXT NOT NULL, currentRevision TEXT NOT NULL REFERENCES revisions(id), content TEXT, deleted INTEGER NOT NULL, updatedAt TEXT NOT NULL, PRIMARY KEY(workspaceId,path));
      CREATE TABLE reviews (id TEXT PRIMARY KEY, workspaceId TEXT NOT NULL REFERENCES workspaces(id), changeSetId TEXT NOT NULL REFERENCES changes(id), authorId TEXT NOT NULL, body TEXT NOT NULL, createdAt TEXT NOT NULL);
      CREATE TABLE tasks (id TEXT PRIMARY KEY, workspaceId TEXT NOT NULL REFERENCES workspaces(id), title TEXT NOT NULL, instructions TEXT NOT NULL, assigneeId TEXT NOT NULL REFERENCES agents(id), status TEXT NOT NULL CHECK(status IN ('open','in_progress','done')), createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL);
      CREATE TABLE activity (id TEXT PRIMARY KEY, workspaceId TEXT NOT NULL REFERENCES workspaces(id), actorId TEXT NOT NULL, action TEXT NOT NULL, resourceId TEXT NOT NULL, metadata TEXT NOT NULL CHECK(json_valid(metadata)), createdAt TEXT NOT NULL);
      CREATE INDEX activity_workspace ON activity(workspaceId,createdAt);
      PRAGMA user_version = 1;
    `);
    })();
  if (version < 2) {
    try {
      db.transaction(() => {
        db.exec(`
          CREATE TABLE idempotency (
            workspaceId TEXT NOT NULL REFERENCES workspaces(id),
            principalId TEXT NOT NULL,
            keyHash TEXT NOT NULL,
            fingerprint TEXT NOT NULL,
            response TEXT NOT NULL CHECK(json_valid(response)),
            createdAt TEXT NOT NULL,
            PRIMARY KEY(workspaceId,principalId,keyHash)
          );
          CREATE INDEX changes_workspace ON changes(workspaceId);
          CREATE INDEX tasks_workspace ON tasks(workspaceId);
          CREATE INDEX reviews_change ON reviews(workspaceId,changeSetId);
          CREATE INDEX grants_workspace ON grants(workspaceId);
          PRAGMA user_version = 2;
        `);
      }).immediate();
    } catch (error) {
      db.close();
      throw error;
    }
  }
  return db;
}
