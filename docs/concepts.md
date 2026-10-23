# Concepts

## Workspace

A workspace is the boundary for documents, identities, grants, changes, tasks, and activity. Agent credentials bind to exactly one workspace. The current operator can administer all local workspaces.

## Agent and domain

An agent is an authenticated identity, not a model name. A domain describes its responsibility. The domain label alone grants nothing; scoped grants are the actual authority. Two instances of the same model can have different tokens and different permissions.

## Managed document

A document has a canonical absolute virtual path and an immutable revision chain. Paths such as `/research/brief.md` are database resource names. They never address the host filesystem. Text is well-formed Unicode; empty text is valid. Individual text content is limited to 256 KiB in UTF-8.

## Grant

A grant allows or denies selected actions in a path scope. Grants may expire or be revoked. Matching denies override allows. See [permission semantics](permission-model.md).

## Change set

A change set contains a title, author, expected base revisions, exact operations, and a SHA-256 content fingerprint. It is immutable after creation. A proposal can affect at most 20 distinct paths and must fit the HTTP request limit of 1 MiB.

## Review, approval, and application

Review notes are advisory. Approval is an operator decision bound to the content fingerprint. Application is a separate operator action that rechecks the author's current authority and every expected revision before a transaction commits.

## Revision and restoration

Every applied operation creates a revision. Deletions create tombstones. A restoration is another proposed edit against the current head, preserving the original history.

## Task and handoff

A task describes work assigned to an agent. Handoffs change assignment, not authority. The receiving agent must already have the document permissions it needs.

## Activity

Successful administrative and document mutations produce activity records. The administrative overview returns the latest 200 records. This is not a tamper-proof audit ledger or a full access log.
