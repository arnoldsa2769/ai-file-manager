import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { WorkspaceClient, WorkspaceApiError } from '../packages/sdk/src/index.js';
interface Demo {
  workspaceId: string;
  writer: { token: string };
  reviewer: { token: string };
}
const demo = JSON.parse(
  await readFile(resolve(process.env.AFM_DATA_DIR ?? 'data', 'demo-agents.json'), 'utf8'),
) as Demo;
const baseUrl = process.env.AFM_URL ?? `http://127.0.0.1:${process.env.AFM_PORT ?? 7310}`;
const writer = new WorkspaceClient({ baseUrl, token: demo.writer.token });
const reviewer = new WorkspaceClient({ baseUrl, token: demo.reviewer.token });
const path = '/drafts/integration.md';
let baseRevision: string | null = null;
try {
  baseRevision = (await writer.read(demo.workspaceId, path, true)).currentRevision;
} catch (error) {
  if (!(error instanceof WorkspaceApiError && error.code === 'NOT_FOUND')) throw error;
}
const proposal = await writer.propose(demo.workspaceId, 'Demonstrate two-agent collaboration', [
  {
    path,
    baseRevision,
    content:
      '# Independent agents\n\nThe writer proposes this synthetic text. The reviewer can advise, but only the operator can approve and apply.\n',
  },
]);
await reviewer.review(
  demo.workspaceId,
  proposal.id,
  'The proposal preserves independent agent identity and explicit operator approval.',
);
console.log(
  `Proposal ${proposal.id} was created by the writer and reviewed by a separate identity. Inspect it in the console before approving or applying.`,
);
