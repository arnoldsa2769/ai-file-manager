# ADR 003: Immutable Proposals and Revalidated Application

Status: accepted.

## Context

Multiple agents can read the same document revision and propose conflicting edits. Approval can outlive an agent's access rights. A mutable proposal can silently change what an operator intended to authorize.

## Decision

Make proposals immutable. Bind approval to the exact content fingerprint. Recheck the author, current grants, expiration, and expected revision heads inside an immediate transaction before applying any operation. Keep advisory agent review separate from operator approval.

## Consequences

Conflicts preserve all current heads and leave the proposal unapplied. Revocation can invalidate approved work. Agents must create replacement proposals for rebases or content changes. The operator can approve their own human edits, while agents cannot approve or apply. Semantic merging remains future protocol work. [ADR 004](004-reliable-paged-protocol.md) adds optional durable proposal/apply keys while preserving this approval protocol.
