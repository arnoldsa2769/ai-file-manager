# ADR 004: Durable Retries and Metadata Pagination

## Status

Accepted, 2026-10-28.

## Context

A client timeout cannot tell whether a proposal or an atomic application committed. Repeating a proposal can duplicate work, while repeating an applied change without a receipt returns a state error. The full operator overview also includes every document body and proposed operation, causing unrelated text to travel after routine UI actions.

## Decision

Use optional explicit idempotency keys for proposal creation and apply. Keep the receipt and business mutation in one immediate SQLite transaction, scoped to workspace and authenticated principal. Store a key digest and a canonical request fingerprint, preserve the original successful response, and check current authority before replay. Avoid credential-creation response caching. Do not add transparent write retries or time-based eviction.

Add metadata-only document, change, and revision pages and an operator count summary. Administrative collections and assigned tasks use the same `{ items, nextCursor }` envelope. Use bounded candidate scans and row-sequence keysets with an upper insert watermark. Bind cursor context to identity, workspace, collection, and filters. Authorization is always evaluated from current state; a cursor never conveys a permission or a historical authorization snapshot.

Keep old response shapes for existing integrations. The console adopts pages and selected detail requests, while legacy routes remain documented for small local workspaces.

## Consequences

Retry protection requires retaining the same key and payload. A successful replay can contain an earlier resource status; read the resource to inspect its current state. Failed mutations reserve no key. Receipt retention increases private database size, so backup and storage policies must cover responses as well as revisions.

New inserts do not shift a traversal, but updates, deletion state, task assignment, and policy changes are live. A filtered agent page can be empty with a continuation. Pagination is bounded traversal, not a point-in-time export or a guarantee of constant query cost: path search, JSON path projection, and authorization filtering still require work. Signed external cursors, large-scale indexing, quotas, retention, and hosted deployment need separate designs.

Schema 2 is an additive transactional upgrade. Restoring a schema-1 backup is the downgrade mechanism; no destructive reverse migration is supplied.
