# Access Inspection Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Implementation and GitHub publication are authorized; details are delegated by the owner.

**Goal:** Make current agent capabilities explainable without widening authority.

**Architecture:** Share a request-local compiled policy evaluator between enforcement and preflight. Expose bounded typed reports with operator-only rule evidence. Add one read-only MCP tool and a Permissions inspector; retain all existing enforcement gates.

**Tech Stack:** Existing strict TypeScript, Fastify/Zod, SQLite, React, Node tests, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-30-access-inspection-design.md`

## Global Constraints

- Repository-authored content, comments, commits, and PRs are English.
- Checks contain 1-20 canonical document path/action pairs.
- Agents may inspect only themselves; operator targets must be active and workspace-local.
- Write/delete/review previews require read as well as the requested action.
- Only operator reports include evidence, capped at 20 matched and 20 ignored entries per requirement.
- No policy cache across requests, permission expansion, new credential, or schema change.

## Review Focus

- Preview must never report a usable write capability when current read authority is denied.
- Self-inspection must not reveal grant identifiers, credential data, document existence, or another identity's policy.
- Expiry, explicit denies, and grant/identity revocation must behave identically in enforcement and explanations.
- Delayed results must not survive a changed agent/path selection.
- Partial uploads from the previous turn must be reconciled against the complete tested local tree.

### Task 1: Shared policy and scoped report

**Files:** `packages/core/src/{policy,types,service}.ts`, `apps/server/src/app.ts`, `packages/sdk/src/index.ts`, `packages/mcp/src/server.ts`, `tests/access.test.ts`, `tests/policy.test.ts`.

**Interfaces:** `compilePolicy(grants, evaluatedAt)` produces primitive allows/explain methods; `AccessCheck`, `AccessRequirement`, `AccessReport` types; service/SDK checkAccess methods; strict REST route; additive check_access tool.

- [x] Write failing behavior tests for effective prerequisites, deny/root/adjacent boundaries, fresh revocation, targeting restrictions, redacted/bounded reports, no mutations, and HTTP/SDK/MCP contracts.
- [x] Run focused tests and confirm missing endpoint/evaluator failures.
- [x] Implement shared evaluation, service scope enforcement, report redaction, strict transport schemas, and typed integrations.
- [x] Run focused tests and the full Node suite; retain existing query budgets and policy semantics.
- [x] Commit `feat: explain current scoped agent permissions`.

### Task 2: Operator permission inspector

**Files:** `apps/web/src/PermissionInspector.tsx`, `apps/web/src/Administration.tsx`, `tests/browser.spec.ts`.

- [x] Write browser tests for effective read/write denial, rule evidence, retry, and late responses after path changes; watch them fail before implementation.
- [x] Add a labeled agent/path form, results table, explanation details, and stale-response cleanup using existing page/resource hooks.
- [x] Run browser workflows, strict types, and build; inspect desktop and mobile screenshots together.
- [x] Commit `feat: inspect effective permissions in the operator console`.

### Task 3: Documentation, review, and publication

**Files:** `README.md`, `CHANGELOG.md`, `ROADMAP.md`, `docs/{api,permission-model,architecture,integrations,threat-model}.md`, `docs/adrs/005-access-inspection.md`.

- [x] Document response shapes, self-only MCP behavior, live policy semantics, evidence bounds, and preview limitations; update tool count to ten.
- [x] Run check, browser suite, English-language check, formatting, diff checks, and production dependency audit.
- [x] Obtain a fresh whole-branch review and fix material findings with regression coverage.
- [ ] Reconcile and upload the complete branch through the authorized owner session, verify remote file equality, create an English PR, wait for CI, and complete publication.

## Verification record

- 52 core, transport, SDK, and MCP tests passed.
- 15 browser workflows passed, including late responses, explicit denies, retry recovery, and selection reconciliation after refresh.
- Strict types, production build, formatting, English-language checks, and production dependency audit passed.
- Independent whole-branch review found a stale selected-agent option after paginated refresh; a failing browser regression confirmed it, and selection/report reconciliation fixed it. No other material findings were reported.
