# Architecture

## Design goals

The control plane must keep authority independent of model providers, make changes reviewable, recover from conflicting edits without partial writes, and remain simple to run locally. The initial deployment is one trusted operator and one service process.

## Boundaries

The core owns authorization and persistence. HTTP handlers validate inputs and resolve authenticated principals, then call the core. SDK, CLI, and MCP send HTTP requests. The web console is an operator client and cannot override server decisions.

```text
apps/web ──────────────────────────────┐
packages/cli ──┐                       │
packages/mcp ──┼── packages/sdk ────────┤
AI tools ──────┘                       │
                              apps/server
                                      │
                               packages/core
                                      │
                                   SQLite
```

The MCP bridge exposes nine narrow tools, including exact historical revision reads. It has no shell command, arbitrary host file operation, approval, or apply tool. Model inference remains with external clients; a connected model does not become an operator.

## Persistence model

SQLite runs with foreign keys, WAL mode, and a busy timeout. Schema version 1 creates these entities:

| Entity     | Responsibility                                    |
| ---------- | ------------------------------------------------- |
| workspaces | Local collaboration boundaries                    |
| agents     | Identity metadata, token digest, revocation       |
| grants     | Scoped actions, effect, expiration, revocation    |
| documents  | Current materialized document heads               |
| revisions  | Immutable content snapshots and predecessor links |
| changes    | Immutable proposed operations and approval state  |
| reviews    | Advisory notes attached to a change               |
| tasks      | Assignment, instructions, and lifecycle           |
| activity   | Mutation provenance                               |

Only list-valued operations, actions, and structured activity metadata are stored as JSON. Document content remains plain text. A unique workspace/path key prevents duplicate heads. Parameterized SQL handles values.

## Applying a change

The service opens an immediate transaction, loads the immutable proposal, verifies approval and content digests, resolves its author, re-evaluates current grants, and compares every base revision. Only after all checks pass does it append revisions, advance heads, transition the proposal to applied, and append activity. Any failure rolls back all writes.

Short synchronous database operations make this sequence straightforward in one Node process. Long-running inference never runs inside the transaction.

## Frontend

React and Vite provide the administration console. Development uses an explicit loopback proxy; production serves the built assets from the API origin. No server-side rendering is needed for an authenticated local workbench. Document text is rendered using React text nodes, not HTML.

The console supports empty workspaces as well as an explicitly seeded synthetic demonstration. UI counters come from persisted state. History responses are associated with their requested document, preventing late responses from becoming restore operations on a different file.

Change review reads each exact base revision through the scoped revision endpoint instead of downloading complete histories. Snapshot failures keep approval and application disabled and offer an explicit retry. Switching proposals discards late snapshot responses.

## Scaling boundary

Administrative overview responses currently include full document and proposal content and unpaginated entity lists. This is suitable for small local workspaces, not large repositories. Before expanding scope, introduce paginated metadata endpoints, bounded retention/export, indexed query APIs, and separate document loading.

Hosted tenancy also requires human authentication, tenant-aware authorization, migrations, TLS, rate limits, monitoring, and a revised database deployment model. Adding PostgreSQL alone does not provide those guarantees.

## Decisions

- [Technology stack](adrs/001-technology-stack.md)
- [Managed documents before host filesystem access](adrs/002-managed-documents.md)
- [Immutable proposals and revalidated approval](adrs/003-change-protocol.md)
