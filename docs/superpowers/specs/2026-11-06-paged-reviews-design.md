# Bounded Review Notes

## Intent

Keep proposal review responsive as advisory notes accumulate. Developers and the operator console need bounded reads that preserve the existing proposal visibility rules. The maintainer has delegated implementation details and authorized publication; these choices are implementation decisions.

## Design

Add `GET /v1/workspaces/:workspaceId/changes/:id/reviews/page` and SDK `reviewPage(workspaceId, changeId, options?)`, returning `{ items: Review[], nextCursor: string | null }`. Default limit 25, maximum 100; only `limit` and `cursor` are accepted. Return newest notes first using descending insertion sequence. A first-page upper watermark excludes later inserts from continuation; refresh starts a new traversal. Bind cursors to workspace, authenticated principal, collection, and exact proposal ID. Limits may change between pages. Malformed or mismatched cursors fail with INVALID_INPUT.

Reuse the existing pagination engine with an internal reviews collection and proposal filter. Fetch at most limit + 1 review rows, rather than materializing all notes or the generic 500-candidate budget. Use the existing workspace/proposal index. No schema version or dependency change is needed. Review bodies remain limited to 4000 characters each.

Every page rechecks the current active identity and proposal visibility: authors need read on every affected path; peers need read plus review on every path; operators retain full access. A cursor is navigation context, never authority. No new audit mutations occur. Existing GET reviews arrays retain their oldest-first full-response shape.

Extract a ReviewNotes console component. Fetch only the first page for the selected proposal, render newest first, expose load-more/loading/retry states, and reset traversal after a successful note submission or refresh. Changes of proposal/workspace and late continuation responses must not append notes to another view. Review-note failures stay separate from exact revision loading and do not block proposal inspection or approval. Clearly identify notes as advisory and potentially partial; this does not add mandatory review policy.

## Boundaries

Keep existing approvals, live application checks, MCP tool names/count, and legacy clients compatible. Workspace discovery pagination, hypothetical policies, hosted roles, delegation, retention, and required reviews remain separate work. All repository content and publication text must be English.

## Verification

Cover bounded stable traversal and inserts; legacy ordering; malformed/cross-proposal/principal/workspace cursors; live read/review/identity revocation; strict authenticated no-store HTTP and real SDK calls. Browser coverage includes more than one page, successful note refresh, first/continuation errors, late responses, changed selections, and approval independence. Run the complete core/browser suites, types/build, language/format/diff checks, production audit, and independent whole-branch review before publishing.

## Publication hardening

The production dependency audit exposed moderate glob/minimatch advisories during implementation. Update the existing `@fastify/static` dependency within major version 10 and refresh its transitive lockfile; rerun full verification. This adds no new direct dependency and changes no schema.
