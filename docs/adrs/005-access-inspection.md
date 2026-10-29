# ADR 005: Current-policy access inspection

- Status: Accepted
- Date: 2026-10-30

## Context

Scoped grants are difficult to diagnose from individual rules, especially when denies, expiry, read prerequisites, and partially loaded grant tables interact. Separate explanation logic risks disagreeing with enforcement; giving tools administrative policy access would widen authority.

## Decision

Share an immutable request-local compiled evaluator across enforcement and bounded access reports. Agents inspect only themselves; operators explicitly select an active workspace-local identity and receive capped grant evidence. Write/delete/review reports combine read and the requested primitive action. Expose the report through REST, the SDK, an additive read-only MCP tool, and the Permissions console. The endpoint reads no document state and writes nothing.

## Consequences

Every later operation reloads live policy and applies its normal existence, ownership, approval, and revision checks. Preflight is neither a reservation nor a capability. Self reports omit grant identifiers. Evidence truncation affects diagnostics only, never policy decisions. No schema migration or cross-request cache is needed. Hypothetical rule simulation, delegated capabilities, and task-bound grants require separate designs.
