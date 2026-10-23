# Local Operations

## Configuration

`npm run setup` creates `.env` with mode `0600` and `data/` with mode `0700`. It generates a random operator token and preserves an existing private configuration. It refuses an existing configuration with broad permissions or a symlink rather than overwriting credentials.

| Variable        | Default / purpose                                            |
| --------------- | ------------------------------------------------------------ |
| AFM_ADMIN_TOKEN | Required server operator secret, at least 24 characters      |
| AFM_DATA_DIR    | `./data`, a dedicated private directory                      |
| AFM_PORT        | `7310`, loopback HTTP API and production console             |
| AFM_DEV_ORIGIN  | `http://127.0.0.1:5173`, explicit development browser origin |
| AFM_WEB_PORT    | Optional development UI port, default `5173`                 |
| AFM_URL         | SDK/CLI/MCP server URL, default `http://127.0.0.1:7310`      |
| AFM_TOKEN       | Scoped client credential; independent of the operator token  |
| AFM_WORKSPACE   | Workspace ID for the MCP bridge                              |

Both development processes load the same root `.env`. Existing process environment values take precedence. If changing the UI port, update `AFM_DEV_ORIGIN` to match. Always use the explicit loopback URLs in the startup output.

## Development and compiled execution

`npm run dev` runs API and Vite together and stops its peer when one process exits. `npm run build && npm start` serves the built console and API together at `http://127.0.0.1:7310` by default. Production assets have a restrictive content security policy and do not need a separate frontend server.

The code is a development alpha even when running a compiled build. No public hosting or container deployment is supported in this release. The server intentionally binds to loopback and does not offer a public-interface configuration.

## Backup

With the service running or stopped:

```bash
npm run backup -- ./backups/workspace-2026-10-23.db
```

The command uses SQLite's online backup API, creates a private backup directory if needed, and writes a mode `0600` destination. It refuses to overwrite an existing backup. An existing destination directory must already have mode `0700`. Backups include private content and token digests; encrypt and protect them before transfer.

Do not copy only the main database file while WAL writes may be active. Keep the generated operator token backed up separately in secure secret storage.

## Restore

1. Stop the service and preserve the current data directory before making changes.
2. Restore the backup as `workspace.db` into a new dedicated private directory. Do not reuse unrelated WAL/SHM files.
3. Point `AFM_DATA_DIR` to that new directory and keep the intended operator configuration.
4. Start the service, check `/health`, authenticate, and inspect document history and grants.
5. Revoke agent credentials if the backup or secret distribution may have been exposed.

Automated tests reopen a backup and verify committed content/history. They do not replace a recovery drill for your own deployment.

## Schema and upgrades

The application creates schema version 1 on an empty database and refuses a newer schema version. There are no upgrade migrations yet. Back up before changing application revisions; future schema changes need explicit migration and rollback instructions.

## Logs and retention

HTTP request logging is disabled to avoid credential/body disclosure. The activity table records successful mutations. Its administrative view returns the latest 200 entries, but storage retention is currently unbounded. Establish workspace-size limits operationally until quotas and retention are implemented.

## Platform assumptions

Node.js >=22.13 on macOS or Linux is the initial target. POSIX private file modes are required by local setup and database initialization. Windows ACL equivalence, Docker networking, hosted concurrency, and network filesystems have not been validated.
