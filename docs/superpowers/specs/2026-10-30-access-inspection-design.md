# Explainable, Scoped Access Inspection

## Intent and scope

Developers need to understand effective agent authority without issuing a document read or a mutation. Add read-only permission preflight through the core, REST, SDK, MCP, and operator Permissions page. Preserve default deny, deny precedence, segment-boundary scopes, live expiry/revocation, and human-only approval/application. Build on the pending reliable-pages branch and publish the complete reviewed tree, including its earlier work.

## Shared evaluator

Compile each operation's grants into per-action rule snapshots once, including expiration classification at one timestamp. Both enforcement and explanations consume this evaluator. No cross-request policy cache is introduced. Existing `allowed()` remains a compatible primitive action check. Matching revoked/expired grants cannot authorize or deny; invalid expiry timestamps fail closed. Evidence uses grant identifiers, never token digests or document contents, and is bounded to 20 matching identifiers plus 20 ignored-rule entries per requirement with a truncation flag.

## API contract

`POST /v1/workspaces/:workspaceId/access/check` accepts `{ agentId?, checks: [{ path, action }] }`, with 1-20 checks and actions read/write/delete/review. Validate exact canonical document paths. Agents may omit agentId or name themselves; targeting a different agent is forbidden. Operators must explicitly supply an active identity belonging to that workspace. Identity and grants are loaded fresh for every call.

Return `{ workspaceId, agentId, evaluatedAt, decisions }`. Each decision contains the submitted path/action, an allowed boolean, and primitive `requirements`. Read has one read requirement. Write/delete/review each require both read and the requested action, matching proposal/review enforcement. Each requirement contains action, allowed, and reason (`allow`, `explicit_deny`, `default_deny`). Only operator responses include `evidence: { matchedGrantIds, ignoredGrants: [{ grantId, reason: revoked|expired }], truncated }`.

Preflight does not read document existence or bodies, create grants, store audit mutations, reserve retry keys, approve, or apply. It says whether current policy permits the requested category of operation; other conditions such as valid proposals, document existence, revision heads, ownership, and immutable approval still apply. Responses are authenticated and no-store. Idempotency-Key remains unsupported here because this endpoint does not mutate.

## Integrations and console

Add typed `client.checkAccess(workspaceId, checks, agentId?)` and a read-only `check_access` MCP tool. MCP accepts checks only, so it cannot select a different identity. Existing nine tools remain compatible; the new total is ten.

The Permissions page adds an agent/path form that checks all four actions. Display effective results, per-requirement reasons, bounded rule evidence, and evaluation time. Label write/delete as proposal capabilities. Keep loading, error/retry, empty-identity, and partial identity-page states explicit. Clear results immediately when inputs change; late responses must not populate a different selection. A policy refresh recomputes the submitted check. Use existing console styling and semantic controls.

## Verification and non-goals

Test default/explicit denial, expiry boundaries, revocation, root and adjacent scopes, read prerequisites, fresh checks after revocation, principal/workspace binding, redacted agent responses, bounded evidence, no persistence side effects, strict HTTP validation, real SDK/MCP behavior, browser preview/retry/late-response isolation, and legacy policy/query-budget behavior. Complete existing checks and fresh review before GitHub publication; all repository text and commit/PR content remain English.

No new permission category, delegated credential, task-bound grant, hosted role system, filesystem access, or database migration is included in this permission iteration. Those require separate lifecycle designs.
