
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
    
INSERT INTO workspaces VALUES ('existing-workspace','Before upgrade','2026-10-01T00:00:00Z');
INSERT INTO changes VALUES ('existing-change','existing-workspace','Original','operator','[]','digest','digest','applied','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z');
INSERT INTO revisions VALUES ('existing-revision','existing-workspace','/existing.md','Preserved content',0,NULL,'operator','existing-change','2026-10-01T00:00:00Z');
INSERT INTO documents VALUES ('existing-workspace','/existing.md','existing-revision','Preserved content',0,'2026-10-01T00:00:00Z');
