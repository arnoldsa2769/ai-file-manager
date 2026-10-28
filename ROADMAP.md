# Roadmap

This roadmap separates working capabilities from research directions. It makes no delivery-date commitments.

## Foundation: implemented

- [x] Local operator service and administrative web console.
- [x] Independent agent identities with revocable tokens.
- [x] Scoped read, write, delete, and review grants with expiration and deny precedence.
- [x] Immutable multi-document proposals, explicit approval, and atomic application.
- [x] Optimistic revision checks, history, deletion tombstones, and restoration proposals.
- [x] Advisory agent reviews and task handoffs.
- [x] REST, TypeScript client, CLI, and scoped MCP stdio tools.
- [x] Synthetic collaboration example and consistent database backups.
- [x] Domain, transport, integration, and browser verification.
- [x] Durable proposal/apply idempotency and schema-1 migration.
- [x] Paginated metadata and activity APIs, server-side filters, and console lazy content loading.

## Next: protocol and governance

- [ ] Publish a versioned OpenAPI contract and standalone SDK packages.
- [ ] Add task-bound grants, delegated capabilities, and policy explanation/simulation.
- [ ] Add structured handoff provenance, cancellation, and review requirements.
- [ ] Extend bounded reads to workspace discovery and review notes; benchmark and index large filtered workspaces.
- [ ] Add retention, credential rotation workflows, and operator-controlled upgrade tooling beyond the schema-1 migration.

## Research: document collaboration

- [ ] Compare pessimistic leases with optimistic concurrency for long-running agent edits.
- [ ] Explore semantic diffs and assisted merge, with deterministic human approval boundaries.
- [ ] Evaluate section-level permissions and redacted document views.
- [ ] Study reproducible multi-agent workflows and provenance quality.
- [ ] Support richer document formats without weakening permission checks.

## Future: execution and deployment

- [ ] Optional model runners and provider adapters with explicit outbound data policies, budgets, and cancellation.
- [ ] A sandboxed filesystem adapter with path confinement, symlink defenses, and crash recovery.
- [ ] PostgreSQL-backed hosted tenancy, authenticated human roles, TLS, operational monitoring, and rate limits.
- [ ] Signed external audit export and encrypted storage integrations.

Remote deployment, OS isolation, model scheduling, and binary document support require separate designs and security reviews. They are not properties of the current alpha.
