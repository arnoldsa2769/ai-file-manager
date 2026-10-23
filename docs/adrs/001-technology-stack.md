# ADR 001: TypeScript Control Plane with SQLite

Status: accepted for the local development alpha.

## Context

The project needs a browser console, agent integrations, policy decisions, and transactional document history. The first user should be able to run it without provisioning multiple services.

## Decision

Use strict TypeScript on Node.js, Fastify and Zod for HTTP, React and Vite for the console, and better-sqlite3 for local persistence. Keep domain rules independent of transport. Use npm and a committed lockfile.

## Alternatives

Python/FastAPI offers a strong AI ecosystem, but model inference lives outside this control plane and a second language would duplicate frontend contracts. Rust offers strong isolation-oriented foundations, but it does not itself solve agent authority and would increase initial integration cost. PostgreSQL improves hosted concurrency and operational tooling, but requires a separate service before the single-operator model justifies it.

## Consequences

One language simplifies integration contracts. SQLite supports immediate atomic apply transactions and consistent backups. Native bindings add installation requirements on platforms without prebuilt binaries. Synchronous SQLite requires short bounded operations; it is not a distributed worker architecture. The decision should be revisited for hosted tenancy or large workspaces.
