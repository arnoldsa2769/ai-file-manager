# Bounded Review Notes Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Implementation details and GitHub publication are delegated by the maintainer.

**Goal:** Bound review-note loading while preserving live proposal authorization and legacy contracts.

**Architecture:** Extend the existing internal pagination engine with proposal-scoped reviews and expose a nested REST/SDK route. Extract independently loaded console notes using existing guarded page state.

**Tech Stack:** Strict TypeScript, SQLite, Fastify/Zod, React, Node tests, Playwright; no new direct dependencies or migrations; compatible static-serving security updates.

**Spec:** `docs/superpowers/specs/2026-11-06-paged-reviews-design.md`

## Global Constraints

- English repository content, commits, and PR text.
- Default 25 and maximum 100 notes per page, newest first; at most limit + 1 review rows read.
- Every page rechecks current proposal access, principal, workspace, and revocation.
- Legacy arrays remain oldest first; ten MCP tools unchanged.

## Review Focus

- Continuations cannot be reused for another proposal, principal, or workspace.
- Revoked read/review grants and identities cannot continue browsing cached authority.
- Late continuations cannot enter another proposal or a refreshed traversal.
- Note failures must not disable exact revision inspection or approval.
- Submitting a note starts a fresh bounded traversal and displays the new note.

### Task 1: Core and transport

**Files:** `packages/core/src/{types,pagination,service}.ts`, `apps/server/src/app.ts`, `packages/sdk/src/index.ts`, `tests/review-pages.test.ts`.

**Interfaces:** `ReviewPageOptions` (limit/cursor); service internal `page(..., 'reviews', {changeSetId,...})`; SDK `reviewPage(wid,id,options?)`; nested GET reviews/page.

- [x] Add failing core/HTTP/SDK tests for bounds, stable ordering/inserts, legacy shape, strict query inputs, cursor isolation, and live read/review/identity authority.
- [x] Confirm failures, implement scoped pagination, then run focused and full Node tests plus types.
- [x] Commit the tested core and transport change.

### Task 2: Console and documentation

**Files:** `apps/web/src/{ReviewNotes,Changes,components}.tsx`, `tests/browser.spec.ts`, README, CHANGELOG, ROADMAP, API/integration/architecture/permission/operations documents.

- [x] Add browser regressions for bounded notes, continuation retry, initial failure independent of approval, stale response isolation, and note submission refresh; confirm red.
- [x] Extract the notes component, use the existing page hook, keep advisory notes independent of revision readiness, and pass browser tests.
- [x] Document limits, authorization, ordering, refresh semantics, compatibility, and remaining unbounded discovery.
- [x] Run full check/browser/language/format/diff/audit, inspect desktop/mobile once, and request independent review.
- [ ] Publish the verified English commits through the authorized owner session, verify remote tree equality and CI, and complete publication.

## Verification record

- Baseline: 52 core tests. New coverage: five review-page tests and three browser workflows.
- 57 core tests and 18 browser workflows passed after the static-serving dependency patch.
- Independent review found no material issues and confirmed SQLite uses the existing reviews index.
- Patched static-serving and transitive glob/minimatch dependencies after the audit reported three moderate advisories; production audit now reports zero vulnerabilities. Final full verification passed after the patch, including a real static index/asset/SPA/authentication smoke check. Independent follow-up review confirmed compatibility.
