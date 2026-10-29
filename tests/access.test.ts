import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import * as policy from '../packages/core/src/policy.js';
import { WorkspaceService } from '../packages/core/src/service.js';
import { operator, type Grant } from '../packages/core/src/types.js';
import { createApp } from '../apps/server/src/app.js';
import { WorkspaceClient } from '../packages/sdk/src/index.js';
import { createMcpServer } from '../packages/mcp/src/server.js';

const token = 'access-preview-operator-token-at-least-24';
const checks = [
  { path: '/drafts/a.md', action: 'read' as const },
  { path: '/drafts/a.md', action: 'write' as const },
];
function rule(id: string, overrides: Partial<Grant> = {}): Grant {
  return {
    id,
    workspaceId: 'w',
    agentId: 'a',
    scope: '/drafts',
    actions: ['read', 'write'],
    effect: 'allow',
    expiresAt: null,
    revokedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}
async function fixture(t: TestContext) {
  const service = new WorkspaceService(':memory:');
  const workspace = service.createWorkspace(operator, 'Access inspection');
  const identity = service.createAgent(operator, workspace.id, {
    name: 'Writer',
    domain: 'Drafts',
    provider: 'External',
  });
  const principal = service.authenticateAgent(identity.token)!;
  const writeGrant = service.createGrant(operator, workspace.id, {
    agentId: principal.id,
    scope: '/drafts',
    actions: ['write'],
    effect: 'allow',
  });
  const app = await createApp({ service, adminToken: token });
  t.after(async () => {
    await app.close();
    service.close();
  });
  return {
    service,
    workspace,
    identity,
    principal,
    writeGrant,
    app,
    root: `/v1/workspaces/${workspace.id}`,
    headers: { authorization: `Bearer ${token}` },
  };
}

test('compiled enforcement and explanations share deny precedence, boundaries, expiry, and immutable rule snapshots', () => {
  const grants = [
    rule('allow', { scope: '/' }),
    rule('deny', { scope: '/drafts/private', effect: 'deny' }),
    rule('expired', { expiresAt: '2026-10-30T00:00:00Z', effect: 'deny' }),
    rule('revoked', { revokedAt: '2026-10-01T00:00:00Z', effect: 'deny' }),
  ];
  const evaluator = policy.compilePolicy(grants, new Date('2026-10-30T00:00:00Z'));
  assert.equal(evaluator.allows('write', '/drafts/a.md'), true);
  const denied = evaluator.explain('read', '/drafts/private/a.md');
  assert.equal(denied.allowed, false);
  assert.equal(denied.reason, 'explicit_deny');
  assert.deepEqual(denied.evidence.matchedGrantIds, ['allow', 'deny']);
  assert.deepEqual(denied.evidence.ignoredGrants, [
    { grantId: 'expired', reason: 'expired' },
    { grantId: 'revoked', reason: 'revoked' },
  ]);
  grants[0]!.actions.length = 0;
  grants[0]!.scope = '/elsewhere';
  assert.equal(evaluator.allows('write', '/drafts/a.md'), true);
  const scoped = policy.compilePolicy([rule('scoped')]);
  assert.equal(scoped.explain('read', '/drafts-private/a.md').reason, 'default_deny');
  assert.equal(scoped.allows('read', '/drafts-private/a.md'), false);
  assert.equal(
    policy
      .compilePolicy([rule('invalid-expiry', { expiresAt: 'invalid' })])
      .allows('read', '/drafts/a.md'),
    false,
  );
  assert.throws(() => scoped.explain('read', '/drafts/../a.md'), { code: 'INVALID_PATH' });
});

test('effective preflight requires read for writes, deletion proposals, and advisory reviews', async (t) => {
  const { service: s, workspace: w, principal: p } = await fixture(t);
  for (const action of ['write', 'delete', 'review'] as const) {
    if (action !== 'write')
      s.createGrant(operator, w.id, {
        agentId: p.id,
        scope: '/drafts',
        actions: [action],
        effect: 'allow',
      });
    const decision = s.checkAccess(p, w.id, [{ path: '/drafts/a.md', action }]).decisions[0]!;
    assert.equal(decision.allowed, false);
    assert.deepEqual(
      decision.requirements.map((r) => [r.action, r.allowed, r.reason]),
      [
        ['read', false, 'default_deny'],
        [action, true, 'allow'],
      ],
    );
  }
  s.createGrant(operator, w.id, {
    agentId: p.id,
    scope: '/drafts',
    actions: ['read'],
    effect: 'allow',
  });
  assert.ok(s.checkAccess(p, w.id, checks).decisions.every((d) => d.allowed));
  const denied = s.createGrant(operator, w.id, {
    agentId: p.id,
    scope: '/drafts/a.md',
    actions: ['read'],
    effect: 'deny',
  });
  assert.equal(s.checkAccess(p, w.id, checks).decisions[1]!.allowed, false);
  s.revokeGrant(operator, w.id, denied.id);
  assert.equal(s.checkAccess(p, w.id, checks).decisions[1]!.allowed, true);
});

test('self checks redact rule evidence and operators inspect bounded evidence without persistence side effects', async (t) => {
  const { service: s, workspace: w, principal: p, writeGrant } = await fixture(t);
  for (let i = 0; i < 24; i++)
    s.createGrant(operator, w.id, {
      agentId: p.id,
      scope: '/drafts',
      actions: ['read'],
      effect: 'allow',
    });
  const revoked = s.createGrant(operator, w.id, {
    agentId: p.id,
    scope: '/',
    actions: ['read'],
    effect: 'deny',
  });
  s.revokeGrant(operator, w.id, revoked.id);
  const before = s.overview(operator, w.id);
  const self = s.checkAccess(p, w.id, checks);
  assert.equal(JSON.stringify(self).includes('evidence'), false);
  assert.equal(JSON.stringify(self).includes(writeGrant.id), false);
  assert.equal(JSON.stringify(self).includes(revoked.id), false);
  const report = s.checkAccess(operator, w.id, checks, p.id);
  const evidence = report.decisions[0]!.requirements[0]!.evidence!;
  assert.equal(evidence.matchedGrantIds.length, 20);
  assert.equal(evidence.truncated, true);
  assert.deepEqual(evidence.ignoredGrants, [{ grantId: revoked.id, reason: 'revoked' }]);
  assert.ok(Number.isFinite(Date.parse(report.evaluatedAt)));
  assert.deepEqual(s.overview(operator, w.id), before);
});

test('inspection targets are live identities in the same workspace and cannot be selected by another agent', async (t) => {
  const { service: s, workspace: w, principal: p, identity } = await fixture(t);
  const other = s.createAgent(operator, w.id, {
    name: 'Other',
    domain: 'Other',
    provider: 'External',
  });
  assert.throws(() => s.checkAccess(p, w.id, checks, other.agent.id), { code: 'FORBIDDEN' });
  assert.throws(() => s.checkAccess(operator, w.id, checks), { code: 'INVALID_INPUT' });
  const outside = s.createWorkspace(operator, 'Other workspace');
  assert.throws(() => s.checkAccess(operator, outside.id, checks, p.id), { code: 'FORBIDDEN' });
  assert.throws(() => s.checkAccess(p, outside.id, checks), { code: 'FORBIDDEN' });
  s.revokeAgent(operator, w.id, identity.agent.id);
  assert.throws(() => s.checkAccess(p, w.id, checks), { code: 'FORBIDDEN' });
  assert.throws(() => s.checkAccess(operator, w.id, checks, p.id), { code: 'FORBIDDEN' });
});

test('REST access checks are strict, authenticated, no-store, and do not reveal file existence', async (t) => {
  const { app, root, headers, principal, identity, writeGrant } = await fixture(t);
  const url = `${root}/access/check`;
  assert.equal((await app.inject({ method: 'POST', url, payload: { checks } })).statusCode, 401);
  for (const payload of [
    { checks: [] },
    { checks: Array(21).fill(checks[0]) },
    { checks: [{ path: '/drafts/../x', action: 'read' }] },
    { checks: [{ path: '/drafts/a.md', action: 'approve' }] },
    { checks, extra: true },
    { checks: [{ ...checks[0], grant: true }] },
  ]) {
    assert.equal(
      (
        await app.inject({
          method: 'POST',
          url,
          headers,
          payload: { ...payload, agentId: principal.id },
        })
      ).statusCode,
      400,
    );
  }
  const report = await app.inject({
    method: 'POST',
    url,
    headers,
    payload: { agentId: principal.id, checks },
  });
  assert.equal(report.statusCode, 200);
  assert.equal(report.headers['cache-control'], 'no-store');
  assert.equal(report.json().decisions[1].allowed, false);
  assert.ok(report.body.includes(writeGrant.id));
  const self = await app.inject({
    method: 'POST',
    url,
    headers: { authorization: `Bearer ${identity.token}` },
    payload: { checks: [{ path: '/private/unknown.md', action: 'read' }] },
  });
  assert.equal(self.statusCode, 200);
  assert.equal(self.json().decisions[0].allowed, false);
  assert.equal(self.body.includes('evidence'), false);
  assert.equal(self.body.includes('exists'), false);
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url,
        headers: { ...headers, 'idempotency-key': 'not-a-write' },
        payload: { agentId: principal.id, checks },
      })
    ).statusCode,
    400,
  );
});

test('SDK and the read-only MCP tool return effective self authority across grant revocation', async (t) => {
  const { app, service: s, workspace: w, identity, principal: p, writeGrant } = await fixture(t);
  const read = s.createGrant(operator, w.id, {
    agentId: p.id,
    scope: '/drafts',
    actions: ['read'],
    effect: 'allow',
  });
  const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  const sdk = new WorkspaceClient({ baseUrl, token: identity.token });
  assert.equal((await sdk.checkAccess(w.id, checks)).decisions[1]!.allowed, true);
  const bridge = createMcpServer(sdk, w.id);
  const client = new Client({ name: 'access-inspection-test', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await bridge.connect(b);
  await client.connect(a);
  t.after(async () => {
    await client.close();
    await bridge.close();
  });
  assert.ok((await client.listTools()).tools.some((tool) => tool.name === 'check_access'));
  const first = await client.callTool({ name: 'check_access', arguments: { checks } });
  assert.equal(first.isError, undefined);
  assert.equal(JSON.stringify(first).includes(writeGrant.id), false);
  s.revokeGrant(operator, w.id, read.id);
  const second = await client.callTool({ name: 'check_access', arguments: { checks } });
  const content = second.content as { text: string }[];
  assert.equal(JSON.parse(content[0]!.text).decisions[1].allowed, false);
  assert.equal(JSON.stringify(second).includes('evidence'), false);
});
