# Permission Model

## Principal resolution

The API accepts `Authorization: Bearer <token>`. A configured operator token resolves to the local operator. Otherwise, the service hashes the token and looks for an active agent. Request bodies cannot select another principal. Agents cannot use a credential in another workspace.

Agent tokens contain 256 random bits. Only digests are persisted. Revoking an agent invalidates future authentication and invalidates its pending or approved proposals at apply time.

## Policy evaluation

A grant contains an agent, workspace, scope, actions, effect, optional expiration, and revocation state.

1. Ignore revoked and expired grants.
2. Select grants whose scope contains the target path and whose action matches.
3. Reject if any matching grant denies the action.
4. Allow if a matching grant allows it.
5. Otherwise reject.

Scopes match complete segments. `/research` covers `/research` and `/research/notes.md`; it does not cover `/research-private/notes.md`. `/` is the workspace root scope.

## Operations

| Operation                                       | Required authority                        |
| ----------------------------------------------- | ----------------------------------------- |
| List documents                                  | Return only documents with read authority |
| Read content or revisions                       | read                                      |
| Propose create/update                           | read and write on each path               |
| Propose delete                                  | read and delete on each path              |
| Inspect an owned change                         | read on every affected path               |
| Inspect another agent's change by ID            | read and review on every affected path    |
| List changes as an agent                        | Own proposals whose paths remain readable |
| Add a review                                    | read and review on every affected path    |
| Read/update an agent task                       | Assigned agent or operator                |
| Create tasks, agents, grants, or workspaces     | Operator                                  |
| Revoke credentials/grants; approve/reject/apply | Operator                                  |

Requiring read for a write prevents an agent from proposing edits to an unreadable document through blind revision guesses. A reviewer learns a proposal ID through a task or another explicit handoff; it cannot enumerate every proposal in the workspace.

## Time and revocation

Expiration uses the service host's clock. Keep it accurate. Author permissions are checked during proposal and again during application. Approval never freezes access rights. When a grant expires or is revoked, an approved change may fail to apply without changing its approved status or any document.

Within one synchronous service operation, path and action checks share a single grant read and evaluation timestamp. That snapshot is discarded at the end of the operation. Each later operation reloads current grants and verifies the active identity; application does so inside its immediate transaction. There is no cross-request authorization cache.

The operator is trusted and can read every local workspace. Giving an agent the operator token defeats scoped access. Never share that token in task instructions, model prompts, or MCP settings.

## Canonical paths

Paths must start with `/`, contain well-formed normalized Unicode, and fit 512 JavaScript string units. Reject empty or dot segments, trailing separators, control characters, backslashes, percent-encoded aliases, and root as a document name. Scopes may use `/`.

These are virtual identifiers. No path is joined to a host directory. A future filesystem adapter needs separate confinement, symlink, race, and recovery defenses.

## Pages and retry receipts

Metadata pagination applies the same live workspace, read, ownership, and task-assignment checks as the corresponding list. Identities, grants, activity, and summary counts remain operator-only. Cursors convey navigation context, never authority; newly revoked grants affect subsequent pages. A sparse page can be empty while navigation continues.

Proposal receipt replays re-authenticate the request and recheck current read/write/delete grants on every submitted path before returning saved content. A key never extends access lifetime. Completed application receipt replays require the operator and return the completed response without another write; they do not reapply a change under stale author grants.

## Effective access inspection

`POST /v1/workspaces/:workspaceId/access/check` evaluates 1-20 canonical document path/action pairs against the same compiled evaluator used by enforcement. It does not look up document existence or bodies, append activity, or alter grants. Agents may inspect only their authenticated identity. The operator must select an active agent from the same workspace.

A read decision requires `read`. Write, delete, and review decisions require both `read` and the requested primitive action. Each requirement reports `allow`, `explicit_deny`, or `default_deny`. Operator evidence lists at most 20 matched grant IDs and 20 ignored revoked/expired grants per requirement, with a truncation flag. Decisions still use all applicable grants. Agent reports omit evidence entirely.

The Permissions inspector uses this endpoint, including grants beyond the currently loaded table page. Changing the agent or path hides the previous report; refresh recomputes current policy. A preview creates no capability, does not reserve authority, and may become stale immediately. Actual operations independently enforce ownership, existence, revision, approval, and current policy requirements. Hypothetical rule simulation and delegated/task-bound grants remain future work.
