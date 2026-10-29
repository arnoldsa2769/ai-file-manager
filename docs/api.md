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

## Summary and paginated reads

Use `GET /workspaces/:workspaceId/summary` for operator workspace metadata and persisted counts: `documents` (excluding tombstones), `activeAgents`, `pendingChanges` (pending plus approved), and `tasks`. It contains no document or proposal bodies.

Use `GET /workspaces/:workspaceId/:collection/page` with these collections:

| Collection | Items                                                         | Optional filters                              | Authority                                            |
| ---------- | ------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------- |
| documents  | Document metadata without `content`                           | `query`, `includeDeleted=true`                | Current read permission on each returned path        |
| changes    | Proposal metadata without `operations`, plus `operationCount` | `status=pending\|approved\|applied\|rejected` | Operator, or readable own proposals                  |
| history    | Revision metadata without `content`                           | Required `path`                               | Current read permission on that exact canonical path |
| agents     | Agent metadata without credential digests                     | None                                          | Operator                                             |
| grants     | Scoped grants                                                 | None                                          | Operator                                             |
| tasks      | Tasks, including bounded instructions                         | None                                          | Operator, or current assignee                        |
| activity   | Mutation provenance                                           | None                                          | Operator                                             |

Every collection accepts `limit` (integer 1-100, default 25) and `cursor`. Unknown query fields, invalid limits, and cursors used with another workspace, principal, collection, or filter return `INVALID_INPUT`. `query` is a literal substring search on virtual paths (maximum 512 characters); ASCII case is ignored and `%`/`_` are not wildcard operators. `includeDeleted` defaults to false; use true for tombstones and current heads together.

```json
{
  "items": [
    {
      "workspaceId": "workspace-id",
      "path": "/draft.md",
      "currentRevision": "revision-id",
      "deleted": false,
      "updatedAt": "2026-10-28T00:00:00.000Z"
    }
  ],
  "nextCursor": "opaque-continuation"
}
```

Pages are newest-created-first, using insertion sequence rather than timestamps or path order. Pass the cursor with the same filters until `nextCursor` is null. Limits may change between pages. At most 500 candidate metadata rows are inspected per response; an authorization-filtered page can contain no items and still have a continuation. Do not stop on an empty `items` array alone.

Cursors carry navigation context and an upper insert watermark, not access rights. New inserts appear on a fresh traversal. Updates, deleted state, assignment, and permissions remain live; this is not a database snapshot or an export API. Refresh or start without a cursor to see new records. All authenticated responses use `Cache-Control: no-store`.

Fetch selected content through `/document`, `/changes/:id`, and `/revision`. Existing `/overview`, `/documents`, `/changes`, `/history`, and `/tasks` keep their original full-content/array shapes for compatibility and remain unbounded small-workspace interfaces. Review-note listing and workspace discovery also remain unpaginated.

## Idempotent proposal creation and application

`POST /workspaces/:workspaceId/changes` and `POST /workspaces/:workspaceId/changes/:id/apply` accept optional `Idempotency-Key`. Keys contain 1-128 ASCII letters, digits, `.`, `_`, `:`, or `-`. Reuse the same key after a timeout with the same validated payload. Key scope includes workspace and authenticated principal; changing the operation, apply target, or payload returns `IDEMPOTENCY_CONFLICT` (409). Object field order does not matter; array order does. Keyed apply accepts no body or an empty JSON object.

Successful retries return the original response with the original success status (201 for proposals, 200 for apply), without another proposal, revision, or audit mutation. Replaying an earlier proposal can return `status: pending` after it has advanced: read `/changes/:id` for its current status. Authentication and current proposal read/write/delete grants are rechecked before exposing a saved proposal response. Apply and apply replay remain operator-only.

The receipt commits atomically with the business mutation and survives service restart. Failed requests reserve no key. Keys have no automatic expiry while the database is retained; retain the key for the intended operation, and use a new key for new work. Receipt storage contains private response snapshots but stores only the key digest. Other routes reject this header with `INVALID_INPUT`; approval, review, task updates, and credential creation do not gain retry protection. Requests without a key retain existing behavior, including `INVALID_STATE` on a repeated unkeyed apply.

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
| 409         | INVALID_STATE, REVISION_CONFLICT, APPROVAL_MISMATCH, IDEMPOTENCY_CONFLICT                      |
| 413         | INVALID_REQUEST for oversized HTTP bodies                                                      |
| 500         | INTERNAL_ERROR with no internal stack/details                                                  |

See [retry guidance](collaboration-protocol.md) for keyed and unkeyed mutations. API shape is experimental and may change before a stable release.

## Effective access inspection

`POST /v1/workspaces/:workspaceId/access/check` is an authenticated, read-only operation. Responses use `Cache-Control: no-store`. `Idempotency-Key` is unsupported and rejected. Unknown body/check fields, unknown actions, invalid paths, and batches outside 1-20 checks are rejected.

```json
{
  "agentId": "active-workspace-agent-id",
  "checks": [{ "path": "/drafts/brief.md", "action": "write" }]
}
```

`agentId` is required for operators; agents omit it or supply their own ID. Another agent, another workspace, and revoked targets are forbidden. Paths need not exist: the endpoint evaluates authority without reading document metadata or content.

```json
{
  "workspaceId": "workspace-id",
  "agentId": "active-workspace-agent-id",
  "evaluatedAt": "2026-10-30T00:00:00.000Z",
  "decisions": [
    {
      "path": "/drafts/brief.md",
      "action": "write",
      "allowed": false,
      "requirements": [
        {
          "action": "read",
          "allowed": false,
          "reason": "explicit_deny",
          "evidence": {
            "matchedGrantIds": ["deny-grant-id"],
            "ignoredGrants": [],
            "truncated": false
          }
        },
        {
          "action": "write",
          "allowed": true,
          "reason": "allow",
          "evidence": {
            "matchedGrantIds": ["allow-grant-id"],
            "ignoredGrants": [],
            "truncated": false
          }
        }
      ]
    }
  ]
}
```

Evidence appears only for operators. `ignoredGrants` entries have `grantId` and `reason` (`revoked` or `expired`). Evidence caps each list at 20 entries per requirement and sets `truncated` if more match. All applicable rules contribute to the decision. Reasons are `allow`, `explicit_deny`, and `default_deny`. Read has one requirement; write/delete/review require read and the requested action.

This preview grants no authority and performs no persistence or audit mutation. It does not check document existence, proposal ownership, revision heads, approval, or content validity. Recheck the actual operation; expiry and revocation remain live.
