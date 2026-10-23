# Developer Workspace Design

## Intent and scope

Build a provider-neutral control plane for AI document collaboration, with a real backend, web console, SDK, CLI, and MCP bridge. The owner approved the developer-first direction and delegated implementation details. Repository-authored prose, UI, comments, examples, and commit messages are English. License: MIT.

The initial release manages UTF-8 text documents inside a database. It does not mount arbitrary host directories, invoke models, execute commands, or claim OS isolation. External agents perform inference and call the control plane through their own identity. This boundary prevents a document path from becoming a host filesystem capability.

## Technology decisions

- Node.js >=22.13, TypeScript strict mode, npm lockfile.
- Fastify 5 HTTP service with Zod input validation; localhost binding by default.
- React 19 and Vite administrative console; semantic controls, responsive layout, restrained engineering workbench styling.
- SQLite through better-sqlite3, WAL, foreign keys, versioned schema, synchronous short transactions. One application process owns a database.
- Shared service layer for policy, documents, revisions, change sets, tasks, and activity. Thin HTTP and MCP adapters.
- TypeScript HTTP client and CLI; official MCP SDK for a stdio bridge.
- Node test runner for domain and API tests; Playwright for browser workflows.

SQLite makes local setup and atomic multi-document changes simple. PostgreSQL is deferred until hosted tenancy or distributed workers justify operational complexity. REST is the first integration contract; no GraphQL or event bus is needed for this release. The web app is an operator console, not the policy authority.

## Identities and authority

A single operator authenticates using a locally configured bearer token of at least 24 characters. Agents receive independent random tokens shown once; only SHA-256 digests are stored. Agent credentials bind to exactly one workspace. Revocation is immediate on every subsequent operation. Request bodies and credentials are not logged.

Only the operator creates workspaces, agents, and grants, revokes agents/grants, and approves, rejects, or applies change sets. Agents cannot mint authority. The browser stores the operator token in sessionStorage for the current tab session; sign-out removes it. Serve only on trusted loopback environments; hosted authentication, TLS termination, RBAC, and tenancy remain future work.

## Permission model

Grant fields: workspace, agent, scope, actions, effect, optional expiration, revocation timestamp. Actions: read, write, delete, review. Effects: allow or deny. A scope matches itself and slash-delimited descendants; `/` matches all documents. A grant on `/research` never matches `/research-private`.

Default deny, any matching deny overrides allows, expired/revoked grants are ignored. Existing document read, listing, history, and proposal inspection are filtered or rejected before content is returned. Proposed writes require both read and write; deletions require read and delete. Review comments require read and review for every affected document. Workspace overviews and audit streams are operator-only. Agents see only their own proposals whose paths remain readable, and only tasks assigned to them.

Paths are canonical absolute virtual paths, not OS paths. Reject traversal, dot segments, duplicate separators, backslashes, control characters, percent-encoded aliases, trailing separators, and non-canonical Unicode. Reject duplicate operations on a path. Limit 20 operations per change set, 256 KiB UTF-8 per document, and 1 MiB HTTP bodies.

## Document and revision model

Each document has a stable workspace/path identity and a current revision. Each immutable revision stores text or a deletion tombstone, its predecessor, author, timestamp, and change set. History is append-only through the API. Restoring a revision creates a new proposed revision against the current head; it does not rewrite history.

Change operations carry `path`, `baseRevision` (null for a path never created), and `content` (null means delete). Recreating a deleted path uses the tombstone revision as its base. A proposal is immutable. Its digest binds title, author, and exact operations. Approval records that digest. Applying revalidates the digest, current author authority, all grants and expirations, and every expected base revision inside one SQLite transaction. A conflict applies nothing. Statuses: pending, approved, applied, rejected. Applying twice fails. Operator changes also use change sets; human operator approval is allowed, agent self-approval is not.

## Agent collaboration

Persist tasks with title, instructions, assignee, status, and workspace. The operator creates tasks. Agents can inspect their own tasks, update status, or hand off to another active agent in the same workspace. Handoff does not transfer file permissions. Agent review notes advise the operator but never constitute approval. Model/provider names are descriptive metadata, not implicit permissions.

## Web console

Login and workspace creation lead to an operational workbench: Overview, Documents, Agents, Permissions, Change sets, Tasks, Activity. Every view reads live persisted state. Provide document search, plain-text preview, revision history, edit/delete/restore proposals, exact before/after review, approval and application as separate actions, rejection, agent/token creation, scoped grants and revocation, task assignment/handoff, and clear error/loading/empty states. Do not render raw Markdown as HTML.

## API and integration

Versioned `/v1` endpoints expose workspace administration, scoped document reads/history, change sets and reviews, tasks, and activity. All endpoints except health and static assets require bearer authentication. Request schemas reject unknown fields. Errors have stable codes and appropriate 400/401/403/404/409 responses. Disable cross-origin access except the explicitly configured loopback development UI; reject unapproved Origin headers. Use parameterized SQL throughout.

SDK accepts a base URL and token, has a bounded request timeout, and preserves structured error codes. CLI reads `AFM_URL` and `AFM_TOKEN`; tokens never appear in URLs. MCP registers narrow document, proposal, review, and task tools; no shell or arbitrary file tools. A deterministic two-agent example demonstrates collaboration without a model API key.

## Persistence and operations

Store the database and local demo credentials under ignored `data/`. Configuration uses ignored `.env`. Create private directories with mode 0700 and configuration, database, and backup files with mode 0600. Setup generates an operator token without overwriting an existing configuration. Demo seeding is explicit, uses synthetic documents, and persists sample agent credentials only in ignored local storage. No demo seeding on server boot. Production build serves the compiled console from the same origin. Document consistent backup with SQLite backup tooling, restore checks, and the prohibition on sharing raw database files containing private documents.

## Verification and limitations

Test default deny, deny precedence, scope boundaries, expiration/revocation, workspace isolation, unauthorized metadata/history/proposal reads, forbidden approval, stale revisions, multi-document rollback, deletion/restoration, immutable approved payloads, persistence across restart, origin rejection, authentication, SDK error handling, MCP tools, and an actual browser approve/apply workflow. Run type checking, tests, build, dependency audit, repository language scan, and credential checks before publishing.

This is a local development alpha, not a hardened public service. Activity records are API append-only, not tamper-proof against the host administrator. There is no filesystem sandbox, model scheduler, semantic merge, arbitrary binary support, enterprise SSO, or distributed transaction coordination. These are explicit roadmap stages.
