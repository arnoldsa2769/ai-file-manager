# Agent Domains

A responsibility domain is understandable metadata paired with explicit grants. Model capability, provider reputation, and task urgency never imply access.

## Example team

| Agent    | Responsibility       | Scope     | Actions                  |
| -------- | -------------------- | --------- | ------------------------ |
| Atlas    | Research             | /research | read, write              |
| Scribe   | Drafting             | /research | read                     |
| Scribe   | Drafting             | /drafts   | read, write              |
| Sentinel | Review               | /drafts   | read, review             |
| Operator | Workspace governance | all       | Administrative authority |

The demo's `/private/operator-notes.md` has no agent grant. The text is synthetic, but the access boundary is real.

## Registration

Create a different identity for each independent agent or trust context. A provider field is descriptive; use it to record the framework or connection, not as an authorization selector. Tokens are shown once at registration. Store them in each agent's secret configuration.

## Handoffs

A task can contain the change-set ID to review, a narrow objective, and expected output. An assignee may hand off to another active agent in the same workspace. The receiver authenticates with its own token. Its grants do not change.

If a receiver lacks permission, the request fails. It can ask the operator for a grant through the operator's normal workflow. There is no agent-controlled permission escalation endpoint.

## Revocation and replacement

Revoke an identity when its credentials or role should no longer be trusted. Register a new identity rather than copying an old token into a new process. Task assignment to a revoked agent remains visible to the operator and should be reassigned. Previously authored proposals cannot be applied after revocation.

Task-bound credentials, delegated capability narrowing, machine-enforced task deadlines, and automated model runners are roadmap items.
