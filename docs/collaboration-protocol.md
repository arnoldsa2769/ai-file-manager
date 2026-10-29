# Collaboration Protocol

## End-to-end lifecycle

1. The operator creates a workspace and registers independent agents.
2. The operator grants the minimum document scopes needed by each role.
3. An agent reads permitted current revisions and performs inference outside this service.
4. It submits a proposal containing exact text and expected base revision IDs.
5. A reviewer can add advisory notes within its review domain.
6. The operator reviews the exact snapshots and approves the immutable proposal.
7. The operator requests application.
8. The service rechecks authority and revision heads, then commits all operations atomically.

## Proposal shape

```json
{
  "title": "Clarify the handoff boundary",
  "operations": [
    {
      "path": "/drafts/protocol.md",
      "baseRevision": "the-current-revision-id",
      "content": "# Handoff\n\nAssignment does not transfer permissions.\n"
    }
  ]
}
```

A new path uses `baseRevision: null`. A deletion uses `content: null`. Existing empty text uses `content: ""`. To recreate a deleted path, use its tombstone revision as the base. At most 20 distinct paths can participate.

## States

```text
pending ──approve──> approved ──apply──> applied
   |                    |
   └────reject──────────┴────────────> rejected
```

Approved and pending proposals are immutable. Revising a proposal means creating a new one and rejecting the old one. Applying twice returns `INVALID_STATE`. A conflict returns `REVISION_CONFLICT`; the entire batch remains unapplied.

## Task coordination

Tasks have `open`, `in_progress`, or `done` status and one active assignee. Agents see their own tasks; the operator sees all tasks. An agent may update its task status or hand off to another active identity. Task instructions are untrusted data, not policy.

## Retry behavior

Reads can be retried after a transport failure. Proposal creation and operator apply support optional `Idempotency-Key`. Generate a key before sending, retain the key and exact request for ambiguous failures, and resend with that same key. The service commits the response receipt and mutation together. Replays survive restart and do not append another proposal, revision, or mutation event. Current identity and proposal authority are checked again before replay.

The response is the original successful snapshot, not a live resource read. After an apply timeout, replay with the same key, then read the proposal and document heads for current state. A different payload or target with an already-used key returns `IDEMPOTENCY_CONFLICT`; use a new key only for genuinely new work. Automatic retries are not enabled in the SDK or MCP bridge.

Unkeyed writes and all other mutation endpoints remain ambiguous after a transport failure. Inspect state before retrying them. Never automatically approve a replacement based on an earlier proposal's approval. Keys do not freeze grants, bypass approval, or turn a conflicted proposal into an approved replacement.

## Model independence

The protocol does not prescribe a model, prompt format, inference scheduler, or chain-of-thought storage. It records submitted changes and explicit review notes. Keep hidden reasoning, unnecessary personal data, and credentials out of document content and activity metadata.
