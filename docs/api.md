# HTTP API Reference

Base URL: `http://127.0.0.1:7310`. All `/v1` routes require `Authorization: Bearer <token>`. JSON requests use `Content-Type: application/json`. Authentication is resolved before resource access. The operator console is not an alternative authorization mechanism.

## Routes

Paths below omit the `/v1` prefix. `:workspaceId` and `:id` are path parameters. Administration requires the operator token.

| Method | Path                                                      | Behavior                                                      |
| ------ | --------------------------------------------------------- | ------------------------------------------------------------- |
| GET    | /me                                                       | Current principal                                             |
| GET    | /workspaces                                               | List workspaces; operator only                                |
| POST   | /workspaces                                               | Create workspace: `{name}`                                    |
| GET    | /workspaces/:workspaceId/overview                         | Full operator overview, including text content                |
| POST   | /workspaces/:workspaceId/agents                           | Create identity: `{name, domain, provider}`; token shown once |
| POST   | /workspaces/:workspaceId/agents/:id/revoke                | Revoke identity                                               |
| POST   | /workspaces/:workspaceId/grants                           | Create grant; operator only                                   |
| POST   | /workspaces/:workspaceId/grants/:id/revoke                | Revoke grant                                                  |
| GET    | /workspaces/:workspaceId/documents                        | Readable current documents; excludes tombstones               |
| GET    | /workspaces/:workspaceId/document?path=...                | Read one document; optional `includeDeleted=true`             |
| GET    | /workspaces/:workspaceId/history?path=...                 | Read permitted revisions, newest first                        |
| GET    | /workspaces/:workspaceId/revision?path=...&revisionId=... | Read one exact permitted revision, including tombstones       |
| GET    | /workspaces/:workspaceId/changes                          | Operator: all; agent: readable owned proposals                |
| POST   | /workspaces/:workspaceId/changes                          | Submit immutable proposal                                     |
| GET    | /workspaces/:workspaceId/changes/:id                      | Inspect permitted proposal                                    |
| POST   | /workspaces/:workspaceId/changes/:id/approve              | Approve pending proposal; operator only                       |
| POST   | /workspaces/:workspaceId/changes/:id/reject               | Reject pending/approved proposal; operator only               |
| POST   | /workspaces/:workspaceId/changes/:id/apply                | Revalidate and atomically apply; operator only                |
| GET    | /workspaces/:workspaceId/changes/:id/reviews              | Inspect permitted review notes                                |
| POST   | /workspaces/:workspaceId/changes/:id/reviews              | Add advisory note: `{body}`                                   |
| GET    | /workspaces/:workspaceId/tasks                            | Operator: all; agent: assigned tasks                          |
| POST   | /workspaces/:workspaceId/tasks                            | Create task: `{title, instructions, assigneeId}`              |
| PATCH  | /workspaces/:workspaceId/tasks/:id                        | Update `{status?, assigneeId?}` as assignee/operator          |

`GET /health` is unauthenticated and returns service status/version. Static console assets are public; workspace data is not.

## Grant input

```json
{
  "agentId": "agent-id",
  "scope": "/research",
  "actions": ["read", "write"],
  "effect": "allow",
  "expiresAt": null
}
```

`expiresAt` may be omitted, null, or a future ISO 8601 UTC timestamp. `effect` is `allow` or `deny`; actions are `read`, `write`, `delete`, and `review`.

## Proposal input

```json
{
  "title": "Create a research note",
  "operations": [
    { "path": "/research/note.md", "baseRevision": null, "content": "A synthetic note." }
  ]
}
```

Creation endpoints return the created object directly with HTTP 201. The agent registration response is `{agent, token}`. Other successful routes return HTTP 200. Revocation returns `{ok: true}`. Revision and proposal identifiers are opaque strings.

The exact revision endpoint returns one `Revision` object, not an array. Both query fields are required; `revisionId` must contain 1-200 characters without surrounding whitespace. IDs are never normalized. Unknown query fields are rejected. The lookup binds the ID to the requested workspace and canonical path after checking current read authority. It does not reveal whether a revision exists at an unreadable path. Missing or mismatched revisions return `NOT_FOUND`. Authenticated revision responses use `Cache-Control: no-store`.

## Errors

```json
{
  "error": {
    "code": "REVISION_CONFLICT",
    "message": "Document changed since proposal: /research/note.md"
  }
}
```

| HTTP status | Typical codes                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------- |
| 400         | INVALID_INPUT, INVALID_PATH, INVALID_CONTENT, INVALID_GRANT, INVALID_CHANGE, CONTENT_TOO_LARGE |
| 401         | UNAUTHENTICATED                                                                                |
| 403         | FORBIDDEN, ORIGIN_DENIED                                                                       |
| 404         | NOT_FOUND                                                                                      |
| 409         | INVALID_STATE, REVISION_CONFLICT, APPROVAL_MISMATCH                                            |
| 413         | INVALID_REQUEST for oversized HTTP bodies                                                      |
| 500         | INTERNAL_ERROR with no internal stack/details                                                  |

Mutations have no idempotency keys yet. See [retry guidance](collaboration-protocol.md). API shape is experimental and may change before a stable release.
