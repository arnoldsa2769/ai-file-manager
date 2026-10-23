# Document Versioning

## Revision identity

An applied operation creates a unique revision with workspace, path, content or tombstone, parent revision, author, change-set ID, and timestamp. The document head points to the current revision. History is append-only through the API.

Snapshots deliberately favor simple recovery and exact review over compact storage. Large workspaces will require retention and storage policies before adoption.

## Optimistic concurrency

An agent edits a specific base revision. The apply transaction compares that revision to the current head. If another proposal has advanced the head, application fails with `REVISION_CONFLICT` and commits nothing.

For a multi-document change, every precondition must pass. A conflict in the last operation cannot leave earlier operations applied. The agent should read the new state, reconcile its edits, and create a new proposal requiring a new approval.

## Approval binding

The content fingerprint covers the title, author, and normalized operation structure, including base revisions and text. Approval stores the same fingerprint. Application recomputes it from the persisted proposal and compares both values. Approved content cannot silently drift while retaining approval.

## Deletion and restoration

Deletion writes a tombstone revision. Ordinary agent document listings omit deleted heads. The operator console retains them for recovery. A permitted history query can still inspect prior revisions.

Restoration copies selected historical content into a new proposal against the current head. It does not rewind the database or remove intervening revisions. The console associates history responses with their source path and never uses an older response to restore a different selected document.

## Out of scope

There is no semantic merge, Git branch synchronization, CRDT collaboration, binary diff, or cross-workspace version transfer in this release. Git remains useful for the application source; document history belongs to the workspace database.
