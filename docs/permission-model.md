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
