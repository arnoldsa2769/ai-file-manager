# Changelog

Notable user-facing changes are recorded here. This project is a local development alpha; an entry under Unreleased does not imply a tagged or published package release.

## Unreleased

### Added

- Durable optional idempotency keys for proposal creation and operator application. Successful responses survive restart; changed requests conflict, and current proposal authority is checked before replay.
- Operator workspace summaries and bounded metadata pages for documents, changes, revisions, identities, grants, tasks, and activity.
- Explicit TypeScript SDK retry options and page methods, plus an optional key on the existing MCP proposal tool.
- Transactional SQLite schema 1 to 2 upgrade, with existing document/history preservation tests.

### Changed

- The console loads document and proposal content on selection, browses revision metadata in pages, and opens exact historical snapshots only on demand.
- Document search and change status filtering run on the server. Collection views expose continuation, loading, and retry controls, including agent selectors.
- Late responses cannot populate a different selection or a new traversal after a search round trip.

### Compatibility and operations

- Existing full overview and array routes remain available, and the nine MCP tool names are unchanged. Existing requests without a key retain their state/error semantics.
- Only proposal creation and apply support `Idempotency-Key`; other routes reject the header. SDK and MCP writes are not automatically retried.
- Back up before the first schema 2 startup. Downgrade requires a pre-upgrade database backup; old binaries reject the newer schema.
- Idempotency receipts, revision snapshots, and activity have no automatic retention policy. Legacy lists and review-note reads remain unbounded. Hosted tenancy, execution isolation, and public deployment remain out of scope.
