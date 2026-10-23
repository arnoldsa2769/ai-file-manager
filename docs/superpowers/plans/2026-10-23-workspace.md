# Developer Workspace Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver a tested local multi-agent document control plane and an operational web console.

**Architecture:** A shared transactional domain service owns policy and state. REST, SDK, CLI, MCP, and the web app use that authority. Documents are virtual resources in SQLite.

**Tech Stack:** Node.js >=22.13, TypeScript, Fastify 5, Zod, better-sqlite3, React 19, Vite, official MCP SDK, Node test runner, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-workspace-design.md`

## Global Constraints

- All repository-authored text is English. MIT license.
- Local single-operator alpha, no hosted tenancy or OS sandbox claims.
- Default-deny scoped agent permissions; immutable proposals; atomic revision checks.
- All credentials, user data, generated files, and local execution notes are ignored.

## Review Focus

- Scope prefixes must respect path segment boundaries and reject path aliases.
- Revocation and expiration must invalidate approval-time assumptions at apply time.
- A conflict in any operation must leave every document unchanged.
- Agent listing, history, proposals, reviews, and tasks must not leak another domain.
- Browser requests must reject unapproved origins; errors and logs must not expose tokens.

### Task 1: Policy and transactional document core

**Files:** `packages/core/src/{types,policy,database,service}.ts`, `tests/{policy,service}.test.ts`, root package and TypeScript configuration.

**Interfaces:** Produces `WorkspaceService`, `Principal`, `Operation`, `Grant`, `DomainError`, `canonicalPath`, and `allowed`. Service methods consume explicit principals and workspace IDs; no global agent identity.

- [x] Write failing policy and service tests for deny precedence, expiration, virtual paths, isolated workspaces, revision conflicts, revoked authors, atomic rollback, deletion/restore, and restart persistence.
- [x] Run `npm test`; confirm missing domain behavior fails.
- [x] Implement schemas, typed models, scoped authorization, parameterized database operations, immutable proposals, transactional apply, reviews, and task handoffs.
- [x] Run the domain tests and strict type checking until green.
- [x] Commit the domain deliverable.

### Task 2: HTTP service and developer integrations

**Files:** `apps/server/src/{app,index}.ts`, `packages/sdk/src/index.ts`, `packages/cli/src/index.ts`, `packages/mcp/src/index.ts`, `scripts/{setup,demo}.ts`, `tests/{api,integrations}.test.ts`.

**Interfaces:** Consumes `WorkspaceService`. Produces `createApp({service,adminToken,allowedOrigin?})`, `WorkspaceClient`, versioned routes, and stdio tools. API credentials are never passed as agent IDs in request bodies.

- [x] Write failing HTTP/integration tests for authentication, cross-workspace isolation, origins, schema errors, agent approval rejection, SDK errors, and tool invocation.
- [x] Run those tests and confirm intended failures.
- [x] Implement transport adapters, bounded SDK requests, CLI, MCP, explicit setup, and synthetic demo.
- [x] Run the full test suite and type checks; commit.

### Task 3: Administrative console

**Files:** `apps/web/src/{App,api,components,views}.tsx`, `apps/web/src/styles.css`, web build configuration, `tests/browser.spec.ts`.

**Interfaces:** Consumes `/v1` API only. Operator identity comes from sessionStorage; all API failures remain visible. The console never makes authorization decisions on the server's behalf.

- [x] Write a browser test for login, workspace selection, pending change review, approval/application, history, and responsive navigation.
- [x] Implement the seven live views, accessible forms/dialogs, exact before/after review, and meaningful empty/error/loading states.
- [x] Build and run desktop/mobile browser checks against the real API.
- [x] Run design detector, fix concrete findings in one batch, and commit.

### Task 4: Documentation, security review, and publication

**Files:** English root documents, architecture/policy/versioning/threat-model/integration/operations docs, ADRs, examples, CI. Container deployment is deferred to preserve the loopback-only threat model.

**Interfaces:** Documentation describes verified commands and actual boundaries; planned features are explicitly labeled.

- [x] Replace Apache license with MIT and all authored non-English text with English.
- [x] Add exact setup, demo, API, SDK, CLI, MCP, backup, design decisions, and deployment limitations.
- [x] Run tests, type checks, production build, dependency audit, language and credential checks.
- [x] Request a fresh whole-branch review, address material findings with regression tests, and rerun affected checks.
- [ ] Commit, upload to the authorized GitHub repository, and verify remote content and metadata.
