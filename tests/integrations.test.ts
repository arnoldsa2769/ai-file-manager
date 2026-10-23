import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { WorkspaceService } from '../packages/core/src/service.js';
import { operator } from '../packages/core/src/types.js';
import { createApp } from '../apps/server/src/app.js';
import { WorkspaceClient, WorkspaceApiError } from '../packages/sdk/src/index.js';
import { createMcpServer } from '../packages/mcp/src/server.js';
import { initialize } from '../scripts/setup.js';

test('SDK and MCP use the real HTTP policy boundary for multi-agent collaboration', async (t) => {
  const service = new WorkspaceService(':memory:');
  const token = 'operator-integration-test-token-at-least-24';
  const app = await createApp({ service, adminToken: token });
  const url = await app.listen({ host: '127.0.0.1', port: 0 });
  t.after(async () => {
    await app.close();
    service.close();
  });
  const workspace = service.createWorkspace(operator, 'Integration');
  const writer = service.createAgent(operator, workspace.id, {
    name: 'Writer',
    domain: 'Drafts',
    provider: 'External',
  });
  const reviewer = service.createAgent(operator, workspace.id, {
    name: 'Reviewer',
    domain: 'Review',
    provider: 'External',
  });
  service.createGrant(operator, workspace.id, {
    agentId: writer.agent.id,
    scope: '/drafts',
    actions: ['read', 'write'],
    effect: 'allow',
  });
  service.createGrant(operator, workspace.id, {
    agentId: reviewer.agent.id,
    scope: '/drafts',
    actions: ['read', 'review'],
    effect: 'allow',
  });
  const sdk = new WorkspaceClient({ baseUrl: url, token: writer.token });
  const proposal = await sdk.propose(workspace.id, 'Initial draft', [
    { path: '/drafts/a.md', content: 'Real draft', baseRevision: null },
  ]);
  await assert.rejects(
    sdk.read(workspace.id, '/private/key'),
    (error: unknown) =>
      error instanceof WorkspaceApiError && error.code === 'FORBIDDEN' && error.status === 403,
  );
  const bridge = createMcpServer(
    new WorkspaceClient({ baseUrl: url, token: reviewer.token }),
    workspace.id,
  );
  const client = new Client({ name: 'integration-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await bridge.connect(serverTransport);
  await client.connect(clientTransport);
  t.after(async () => {
    await client.close();
    await bridge.close();
  });
  const tools = await client.listTools();
  assert.ok(tools.tools.some((tool) => tool.name === 'propose_changes'));
  assert.equal(
    tools.tools.some((tool) => tool.name === 'apply_changes'),
    false,
  );
  const review = await client.callTool({
    name: 'review_change',
    arguments: { id: proposal.id, body: 'Reviewed by an independently scoped agent.' },
  });
  assert.equal(review.isError, undefined);
  const denied = await client.callTool({
    name: 'read_document',
    arguments: { path: '/private/key' },
  });
  assert.equal(denied.isError, true);
  service.approve(operator, workspace.id, proposal.id);
  service.apply(operator, workspace.id, proposal.id);
  assert.equal((await sdk.read(workspace.id, '/drafts/a.md')).content, 'Real draft');
  service.revokeAgent(operator, workspace.id, writer.agent.id);
  await assert.rejects(
    sdk.documents(workspace.id),
    (error: unknown) => error instanceof WorkspaceApiError && error.status === 401,
  );
});
test('setup creates private local storage and preserves existing credentials', () => {
  const directory = mkdtempSync(join(tmpdir(), 'afm-config-'));
  try {
    assert.equal(initialize(directory), true);
    const original = readFileSync(join(directory, '.env'), 'utf8');
    assert.match(original, /AFM_ADMIN_TOKEN=[a-f0-9]{64}/);
    assert.equal(statSync(join(directory, '.env')).mode & 0o777, 0o600);
    assert.equal(statSync(join(directory, 'data')).mode & 0o777, 0o700);
    assert.equal(initialize(directory), false);
    assert.equal(readFileSync(join(directory, '.env'), 'utf8'), original);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
