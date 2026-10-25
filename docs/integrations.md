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

| Tool             | Purpose                                                      |
| ---------------- | ------------------------------------------------------------ |
| list_documents   | List readable current documents                              |
| read_document    | Read permitted text                                          |
| document_history | Inspect permitted revisions                                  |
| read_revision    | Read one permitted snapshot using `path` and `revisionId`    |
| propose_changes  | Submit immutable proposals                                   |
| get_change       | Inspect an owned/readable or permitted review proposal by ID |
| review_change    | Add advisory review notes                                    |
| list_tasks       | Read assigned work                                           |
| update_task      | Update status or hand off assignment                         |

There are no shell, host filesystem, permission creation, approval, or application tools. Tool content remains untrusted data. Register each agent with its own bridge configuration and token; do not use the operator token.

## Model providers

OpenAI-compatible, Anthropic, local models, and other frameworks can participate as external agents through these interfaces. This release does not include or test provider-specific model invocation adapters. Model credentials and outbound document disclosure policies belong to your agent runtime until a separately reviewed runner integration exists.
