# Reliable Mutations and Bounded Workspace Reads

## Intent

Make the local developer control plane safe to retry and practical for growing text workspaces. Preserve the existing REST, SDK, CLI, and MCP contracts and the human approval boundary. Keep TypeScript, Fastify, React, and SQLite; do not introduce hosted tenancy or model execution.

## Idempotency

Support optional `Idempotency-Key` on proposal creation and change application. These are the two operations where an ambiguous transport failure can create duplicate work or obscure a completed atomic write. Other mutations do not support this header and must reject it rather than imply retry protection. The SDK exposes explicit keys; it does not automatically retry writes. MCP proposal creation accepts an optional key.

Keys contain 1-128 ASCII letters, digits, periods, underscores, colons, or hyphens. Persist only their SHA-256 digest. Bind a key to the authenticated principal and workspace, and fingerprint the operation, target, and validated request using stable JSON object ordering. A reused key with a different request returns `IDEMPOTENCY_CONFLICT` (409).

Store successful response snapshots and the business write in one immediate SQLite transaction. Failed requests consume no key. A replay returns the original response, even if the proposal subsequently advanced state; clients read the resource for its current state. Re-authenticate each HTTP request and recheck current proposal read/write/delete authority before returning a proposal response. Completed apply replays are operator-only and do not execute application again. No plaintext credentials are recorded. Keys survive process restart and remain reserved while the database is retained; automatic expiry and pruning are out of scope.

Schema version 2 adds the idempotency table and collection indexes. Upgrade version 1 transactionally and preserve every existing entity. Back up before upgrading; an old binary must reject schema 2. Downgrade requires restoring a pre-upgrade backup.

## Bounded reads

Add `GET /v1/workspaces/:workspaceId/summary` and `GET /v1/workspaces/:workspaceId/:collection/page` for documents, changes, history, agents, grants, tasks, and activity. Summary is operator-only and contains workspace metadata and counts, never document or proposal content. Existing full overview and array routes remain compatible but are documented as legacy small-workspace interfaces.

Pages contain `{ items, nextCursor }`. Default limit is 25, maximum is 100. Use newest-created-first row sequence keysets, an initial upper sequence watermark, and opaque versioned cursors bound to workspace, principal, collection, and filters. New inserts do not shift an existing traversal. Cursors are navigation, never authorization; validate their shape and binding and evaluate current permissions on every page. This is not a historical snapshot: updates, deletion state, assignments, and grants remain live.

Documents exclude content and support path search plus deleted entries. Changes exclude operation bodies and expose operation counts, with optional status filtering. History requires an exact canonical path and excludes content; retrieve snapshots through the existing exact revision endpoint. Agents exclude token digests. Activity is operator-only. Agent pages return only readable document metadata, owned readable proposals, and assigned tasks. Denied rows do not supply cursor path values or page totals. Bound each request to at most 500 candidate rows; clients must follow nextCursor even after an empty filtered page.

## Console

Use summary counts and bounded collection pages instead of the full overview. Provide explicit load-more controls, server-side document search and proposal status filtering, loading/error/retry states, and stale-response guards. Load selected document and proposal bodies on demand. Version history loads metadata pages and fetches an exact snapshot for restore. Existing snapshot approval gates remain fail-closed. Preserve the current visual system and responsive layout.

Administrative identity and grant pages may load further pages explicitly. Selectors expose a load-more action so an unloaded agent can be selected. Display identifiers when a referenced identity has not been loaded; do not invent missing names or permissions. Workspace discovery remains the existing small local operator list.

## Verification and publication

Prove retry deduplication, mismatched keys, rollback, restart persistence, permission revocation, workspace/principal binding, and version-1 migration. Prove pagination bounds, sparse authorized pages, concurrent insert stability, cursor/filter mismatch rejection, metadata-only responses, and legacy compatibility. Exercise SDK and MCP requests and browser workflows for lazy details, filters, load more, recovery, and late responses. Run the full test suite, strict types, build, browser tests, formatting, English-language check, and dependency audit. Publish English commits, changelog, API/SDK/protocol/operations documentation, and an English pull request.
