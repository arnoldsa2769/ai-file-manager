# Changelog

Notable user-facing changes are recorded here. This project is a local development alpha; an entry under Unreleased does not imply a tagged or published package release.

## Unreleased

### Added

- Proposal-scoped review-note pages through REST and the TypeScript SDK. Default 25, maximum 100 notes, newest first, with current permissions checked on every page.

- Effective permission inspection through REST, the TypeScript SDK, the read-only MCP `check_access` tool, and the operator Permissions console. Agent reports are self-only and omit grant identifiers; operator evidence is bounded.

- Durable optional idempotency keys for proposal creation and operator application. Successful responses survive restart; changed requests conflict, and current proposal authority is checked before replay.
- Operator workspace summaries and bounded metadata pages for documents, changes, revisions, identities, grants, tasks, and activity.
- Explicit TypeScript SDK retry options and page methods, plus an optional key on the existing MCP proposal tool.
- Transactional SQLite schema 1 to 2 upgrade, with existing document/history preservation tests.

### Changed

- Review notes load independently in bounded pages with continuation and retry controls. Failed note reads no longer block exact proposal snapshots or operator approval. Successful note submission refreshes the bounded traversal; late continuations cannot enter another proposal or a refreshed view.

- The console loads document and proposal content on selection, browses revision metadata in pages, and opens exact historical snapshots only on demand.
- Document search and change status filtering run on the server. Collection views expose continuation, loading, and retry controls, including agent selectors.
- Late responses cannot populate a different selection or a new traversal after a search round trip.

### Security

- Update `@fastify/static` to 10.1.10 and refresh its glob/minimatch dependencies to address the current cancellation and pattern-amplification advisories.

### Compatibility and operations

- Existing full overview and array routes remain available, and the nine existing MCP tool names are unchanged; `check_access` is additive. Existing requests without a key retain their state/error semantics.
- The legacy review-note array stays oldest first; the new page route and console are newest first. No schema migration or new dependency is required for review-note pagination; static-serving dependencies also receive compatible security updates.
- Only proposal creation and apply support `Idempotency-Key`; other routes reject the header. SDK and MCP writes are not automatically retried.
- Back up before the first schema 2 startup. Downgrade requires a pre-upgrade database backup; old binaries reject the newer schema.
- Idempotency receipts, revision snapshots, and activity have no automatic retention policy. Legacy full lists, including the older review-note array route, and workspace discovery remain unbounded. Hosted tenancy, execution isolation, and public deployment remain out of scope.
