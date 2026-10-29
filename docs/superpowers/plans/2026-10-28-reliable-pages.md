# Reliable Mutations and Bounded Reads Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. The user has authorized implementation and GitHub publication.

**Goal:** Add durable retry protection and metadata pagination, then move the console onto bounded reads.

**Architecture:** Keep legacy routes intact. Isolate persistence helpers for idempotency and pagination, enforce authorization in WorkspaceService, and expose additive HTTP/SDK contracts. The console uses typed metadata pages and fetches selected bodies separately.

**Tech Stack:** TypeScript, Fastify, Zod 4, better-sqlite3, React, Vite, Node tests, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-reliable-pages-design.md`

## Global Constraints

- Repository-authored text, code comments, commits, and PR content are English.
- Existing routes and the nine MCP tools remain compatible.
- Idempotency supports proposal creation and apply only; keys are 1-128 restricted ASCII characters and are hashed at rest.
- Current authority is checked on every page and proposal replay; apply remains operator-only.
- Pagination defaults to 25, caps at 100, and scans at most 500 candidates per response.
- Schema 1 upgrades transactionally to schema 2; no deletion or automatic retention changes.
- No additional runtime dependency, hosted deployment, or OS isolation claim.

## Review Focus

- A lost proposal response must not cause another proposal or audit event after restart.
- A revoked grant must block a cached proposal response and subsequent metadata pages.
- An empty authorized page can still have a continuation; clients must allow continuation.
- Switching selections or filters during a delayed request must not expose stale bodies or actions.
- Existing database content and legacy API response shapes must survive migration.

### Task 1: Durable proposal and apply idempotency

**Files:** `packages/core/src/{database,idempotency,service}.ts`, `apps/server/src/app.ts`, `packages/sdk/src/index.ts`, `packages/mcp/src/server.ts`, `tests/idempotency.test.ts`.

**Interfaces:** Optional final key argument on service propose/apply. SDK request/propose accept optional `{ idempotencyKey }`; add typed apply. MCP propose accepts optional idempotencyKey.

- [x] Write HTTP tests for identical and reordered requests, conflict, unsupported/invalid headers, no-key compatibility, concurrent replay, rollback, revocation, restart, and v1 migration.
- [x] Run `node --import tsx --test tests/idempotency.test.ts`; observe failures because retry protection is absent.
- [x] Add schema 2 migration, transactional replay helper, scoped service integration, validated HTTP header handling, and SDK/MCP key forwarding.
- [x] Run focused tests and `npm test`; expect all to pass.
- [x] Commit as `feat: add durable idempotency for proposals and application`.

### Task 2: Scoped metadata pagination

**Files:** `packages/core/src/{pagination,types,service}.ts`, `apps/server/src/app.ts`, `packages/sdk/src/index.ts`, `tests/pagination.test.ts`.

**Interfaces:** `Page<T>`, `PageOptions`, typed metadata records, `WorkspaceSummary`; service summary/page methods; SDK summary and typed collection page methods.

- [x] Write tests for page limits/order, insert stability, scoped metadata-only reads, cursor validation/binding, sparse pages, current grant revocation, history isolation, and legacy compatibility.
- [x] Run `node --import tsx --test tests/pagination.test.ts`; observe missing endpoint/contract failures.
- [x] Implement bounded metadata SQL reads, validated cursor context, current authorization, counts, and strict HTTP query validation.
- [x] Run focused tests and `npm test`; expect all to pass.
- [x] Commit as `feat: add bounded metadata pages and workspace summaries`.

### Task 3: Console lazy loading and pagination

**Files:** `apps/web/src/{App,components,Documents,Changes,Administration}.tsx`, `apps/web/src/pages.ts`, `tests/browser.spec.ts`.

**Interfaces:** Console data contains summary and loaded metadata pages, continuation state, refresh generation, and collection load-more controls. Details use SDK read/change/revision.

- [x] Add browser tests that reject full overview/list requests, detect eager content, and exercise later pages, remote search/status filters, failed detail retries, and delayed-response isolation.
- [x] Run the new browser tests and observe current eager overview failure.
- [x] Implement bounded initial reads, accessible load-more/retry states, lazy document/proposal/history bodies, and selection/filter cleanup, preserving snapshot approval gates.
- [x] Run all browser tests, strict types, and production build; expect all to pass.
- [x] Commit as `perf: load console metadata and selected content on demand`.

### Task 4: Open-source documentation and release validation

**Files:** `README.md`, `CHANGELOG.md`, `ROADMAP.md`, `docs/{api,architecture,collaboration-protocol,document-versioning,integrations,operations,permission-model}.md`, `docs/adrs/004-reliable-paged-protocol.md`.

- [x] Document supported retry endpoints, replay semantics, pagination contracts, migration/rollback, compatibility, and remaining boundaries.
- [x] Run `npm run check`, `npm run test:browser`, `npm run language-check`, `npm run format:check`, `git diff --check`, and `npm audit --omit=dev --audit-level=high`; expect all to pass.
- [x] Obtain a fresh whole-branch code review and resolve material findings with regression tests.
- [ ] Commit English documentation, publish branch/PR through the authorized owner session, wait for CI, and verify the merged main tree.
