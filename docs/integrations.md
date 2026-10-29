# Developer Integrations

Start the HTTP service first. Use a separate agent token for each AI tool. The same policies apply through every interface.

## TypeScript client

The SDK is a repository module, not a published package. From `examples/`, import:

```typescript
import { WorkspaceClient } from '../packages/sdk/src/index.js';

const client = new WorkspaceClient({
  baseUrl: 'http://127.0.0.1:7310',
  token: process.env.AFM_TOKEN!,
  timeoutMs: 15000,
});

const documents = await client.documents(process.env.AFM_WORKSPACE!);
```

The client supports document reads/history, exact revision reads, proposals, review notes, tasks, identity inspection, and structured requests to `/v1` routes. `WorkspaceApiError` retains `code` and `status`. Requests have a bounded timeout and reject redirects rather than forwarding credentials through them.

When a proposal names a base revision, call `client.revision(workspaceId, path, revisionId)` to fetch that single snapshot. Full `client.history(workspaceId, path)` remains available for browsing. Both require current read authority on the document, including after deletion.

Run `npm run example` after optional demo seeding to exercise two independent clients without a model key. A real framework uses the same calls around its own inference and tool selection logic.

## Bounded reads and explicit retries

```typescript
const workspaceId = process.env.AFM_WORKSPACE!;
let cursor: string | undefined;
do {
  const page = await client.page(workspaceId, 'documents', { limit: 25, cursor });
  for (const document of page.items) console.log(document.path);
  cursor = page.nextCursor ?? undefined;
} while (cursor !== undefined);
```

Pages contain metadata; use `client.read` or `client.change` for selected bodies and `client.revision` for exact historical content. Follow continuation even after an empty authorized page. `client.summary` is operator-only. Existing `documents`, `changes`, `history`, and `overview` methods retain their previous full-response shapes.

```typescript
const idempotencyKey = crypto.randomUUID();
// Persist this key with the request if it must survive a client restart.
const proposal = await client.propose(
  workspaceId,
  'Create a draft',
  [{ path: '/drafts/new.md', baseRevision: null, content: 'A proposed draft.' }],
  { idempotencyKey },
);
// After an ambiguous timeout, resend the identical request with this same key.
```

An operator can call `client.apply(workspaceId, changeId, { idempotencyKey })` after explicit approval. Generic `request` also accepts a fourth `{ idempotencyKey }` argument for the two supported mutation routes. These options forward the header; they do not automatically retry. Successful replay returns the original snapshot; read `client.change` for current status. Other writes reject the key header.

The existing MCP `propose_changes` tool accepts optional `idempotencyKey`; keep it constant when retrying the same proposal. The existing nine tool names and the no-approval/no-apply boundary are unchanged; `check_access` adds a tenth read-only tool. CLI proposal commands continue to use the legacy unkeyed behavior; use the SDK or HTTP when retry protection is required.

## CLI

```bash
export AFM_URL=http://127.0.0.1:7310
export AFM_TOKEN='<scoped-agent-token>'
npm run cli -- me
npm run cli -- documents '<workspace-id>'
npm run cli -- read '<workspace-id>' /research/brief.md
npm run cli -- history '<workspace-id>' /research/brief.md
npm run cli -- propose '<workspace-id>' ./proposal.json
```

Use your shell's secure secret loading mechanism in practice; do not paste real tokens into shared shell transcripts. Proposal JSON follows the [API reference](api.md). Successful commands print JSON. Errors use stderr and a nonzero exit status.

## MCP stdio bridge

After `npm run build`, configure your MCP-compatible agent application to launch the compiled bridge. Replace the example paths and identifiers:

```json
{
  "mcpServers": {
    "ai-file-manager": {
      "command": "node",
      "args": ["/absolute/path/to/ai-file-manager/dist/packages/mcp/src/index.js"],
      "env": {
        "AFM_URL": "http://127.0.0.1:7310",
        "AFM_WORKSPACE": "workspace-id",
        "AFM_TOKEN": "scoped-agent-token"
      }
    }
  }
}
```

The bridge writes protocol messages to stdout and exposes:

| Tool             | Purpose                                                                        |
| ---------------- | ------------------------------------------------------------------------------ |
| check_access     | Preview current read/write/delete/review authority for the configured identity |
| list_documents   | List readable current documents                                                |
| read_document    | Read permitted text                                                            |
| document_history | Inspect permitted revisions                                                    |
| read_revision    | Read one permitted snapshot using `path` and `revisionId`                      |
| propose_changes  | Submit immutable proposals                                                     |
| get_change       | Inspect an owned/readable or permitted review proposal by ID                   |
| review_change    | Add advisory review notes                                                      |
| list_tasks       | Read assigned work                                                             |
| update_task      | Update status or hand off assignment                                           |

There are no shell, host filesystem, permission creation, approval, or application tools. Tool content remains untrusted data. Register each agent with its own bridge configuration and token; do not use the operator token.

## Model providers

OpenAI-compatible, Anthropic, local models, and other frameworks can participate as external agents through these interfaces. This release does not include or test provider-specific model invocation adapters. Model credentials and outbound document disclosure policies belong to your agent runtime until a separately reviewed runner integration exists.

## Effective access preflight

```typescript
const report = await client.checkAccess(workspaceId, [
  { path: '/drafts/brief.md', action: 'write' },
]);
for (const decision of report.decisions) console.log(decision.allowed, decision.requirements);
```

Agent clients omit the optional third `agentId` parameter or select themselves. Operator clients must provide an active workspace-local agent ID as that parameter. The MCP `check_access` tool accepts only `checks` (1-20 path/action pairs), so tools cannot switch the configured identity. Only operator reports contain grant evidence. Write/delete/review decisions require read plus the requested action. This is a current-policy preview, not approval: document existence, proposal ownership, content validation, revision heads, and live application checks still apply. See the [API contract](api.md#effective-access-inspection).
