# Threat Model

## Assets

Private document content and history, agent and operator credentials, proposal integrity, workspace boundaries, and recovery data.

## Trusted components

The local operator, host operating system, application process, its dependencies, local configuration, and SQLite storage. The operator has full administrative access. A host administrator can read or change the database.

## Untrusted inputs

Agent requests, model outputs, document content, task instructions, review notes, arbitrary web origins, malformed paths, and stale revision IDs.

## Threats and controls

| Threat                                | Current control                                                           | Residual risk                                                   |
| ------------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Agent reads another domain            | Default deny, segment-scoped policies, filtered listing/history/proposals | External tools may have independent host access                 |
| Agent impersonates another identity   | Principal comes from bearer credential; per-agent random tokens           | Stolen tokens work until revoked                                |
| Agent escalates permissions           | Administration is operator-only                                           | Sharing the operator token bypasses the model                   |
| Prompt injection in a document        | Document text never changes policy; MCP exposes narrow operations         | Connected agent frameworks must also treat tool content as data |
| Stale approval overwrites newer edits | Immutable payload digest and expected revision checks                     | Human reviewers can still approve harmful content               |
| Partial batch edits                   | All preconditions and writes inside one immediate transaction             | Disk or host failures still require backups                     |
| Path traversal or symlink escape      | Paths are validated virtual identifiers; no filesystem mount              | Future adapters require a new security design                   |
| Document script injection             | Plain-text rendering and production CSP                                   | Dependency or application XSS can expose session tokens         |
| Browser cross-origin requests         | Explicit origin allowlist; bearer auth; no cookie auth                    | Loopback services are not an OS security boundary               |
| Local credential leakage              | Owner-only storage modes and ignored local files                          | No protection from root or a compromised user account           |
| Database theft                        | Private directory and backup modes                                        | Storage is plaintext; encryption is operator responsibility     |
| Audit alteration                      | Mutation records have no API update/delete operation                      | Host administrator can edit storage; no signed export           |
| Resource exhaustion                   | 1 MiB body limit, 20 operations, 256 KiB text limit                       | No rate limiting, global quota, or pagination yet               |

## Deployment decision

The current server binds to `127.0.0.1`. Do not place a public reverse proxy in front of it or use it as a shared hosted service. Hosted use requires real human authentication and roles, tenant isolation, TLS, rate limiting, retention policies, dependency management, monitoring, and an operational incident process.

## Excluded guarantees

No model execution sandbox, outbound data-loss prevention, malicious-host defense, encrypted database, formal verification, tamper-proof audit, or enterprise compliance certification is claimed.
