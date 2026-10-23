# ADR 002: Managed Documents Before Filesystem Mounts

Status: accepted.

## Context

Direct host file access creates path traversal, symlink, time-of-check/time-of-use, external mutation, and crash-recovery problems. Declaring a directory scope is insufficient to provide safe filesystem isolation.

## Decision

The initial workspace stores text documents and immutable revisions in SQLite. Virtual paths identify resources and never resolve to host paths. The service does not expose shell execution or arbitrary file tools.

## Consequences

Policy and history have one transactional authority. Multi-document apply can be all-or-nothing. Users must create text documents through proposals; existing host directories are not automatically indexed or synchronized. Filesystem adapters need a separate threat model, confinement mechanism, file watcher semantics, and recovery design.
