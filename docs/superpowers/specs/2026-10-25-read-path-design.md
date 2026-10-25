# Scoped Read Path Optimization

## Intent

Reduce redundant database reads and revision transfer in the existing local control plane. Preserve its default-deny policy, immutable proposals, operator approval, English documentation, and MIT license.

## Findings

- `WorkspaceService.can` loads the same agent grants for every path/action check. Document and proposal listings therefore issue a grant query per item; a 20-operation proposal can issue 40 grant queries.
- Change review downloads full document histories merely to select the exact base revisions named by the proposal. Transfer grows with unrelated revisions rather than the snapshots being reviewed.

## Decisions

Each service operation will load an agent's grants once into a local authorization function. It will evaluate all checks at one captured time, then discard the function. No authorization data survives into a subsequent request or the apply transaction. Operator requests need no grant query. Revoked identities, workspace boundaries, segment matching, deny precedence, and fresh apply-time checks remain authoritative.

Add `GET /v1/workspaces/:workspaceId/revision?path=...&revisionId=...` returning one immutable `Revision`. Validate the canonical path and current read permission before looking up the workspace/path/revision tuple. Missing or mismatched revisions return `NOT_FOUND`; unreadable paths return `FORBIDDEN` without revealing existence. Historical content and deletion tombstones remain readable only under current read authority.

Expose the same read through `WorkspaceClient.revision(wid, path, revisionId)` and the read-only MCP tool `read_revision`. Keep all existing routes, SDK methods, and eight existing tools compatible. Change review will request exact snapshots and retain its loading/error gates and stale-response cleanup. Missing base snapshots must never become approvable as new documents.

## Scope and limits

No database migration, additional dependency, policy semantics expansion, deployment change, or visual redesign. Full history remains available for explicit history browsing. Lists and the operator overview remain unpaginated; these changes do not claim large-repository or production readiness.

Final auditing identified GHSA-mrhx-c7xc-m3w5 in the existing Zod 3 dependency. Upgrade only that direct dependency to the patched Zod 4.6.7 line and refresh its lockfile entry. The installed MCP SDK supports Zod 4. Preserve HTTP validation contracts and verify actual MCP schema discovery and tool execution after the upgrade. No other dependency upgrade is included.

## Verification

Use real SQLite query instrumentation to prove constant grant-query budgets, together with assertions on returned data, revocation, expiry, and denied paths. Exercise exact revision reads at domain, HTTP, SDK, and MCP boundaries. Browser tests must show a historical base rather than the latest content, avoid full-history requests during change review, and block approval when the base cannot load. Run all existing tests, type checks, production build, formatting, language checks, and dependency audit before publication.
