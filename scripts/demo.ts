import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { WorkspaceService } from '../packages/core/src/service.js';
import { operator } from '../packages/core/src/types.js';
if (!process.env.AFM_ADMIN_TOKEN) throw new Error('Run npm run setup first.');
const directory = resolve(process.env.AFM_DATA_DIR ?? 'data');
const s = new WorkspaceService(resolve(directory, 'workspace.db'));
try {
  if (s.listWorkspaces(operator).some((w) => w.name === 'Research workspace'))
    throw new Error('Demo workspace already exists; seed was not repeated.');
  const w = s.createWorkspace(operator, 'Research workspace');
  const researcher = s.createAgent(operator, w.id, {
    name: 'Atlas',
    domain: 'Research',
    provider: 'External agent',
  });
  const writer = s.createAgent(operator, w.id, {
    name: 'Scribe',
    domain: 'Writing',
    provider: 'External agent',
  });
  const reviewer = s.createAgent(operator, w.id, {
    name: 'Sentinel',
    domain: 'Review',
    provider: 'External agent',
  });
  const initial = s.propose(operator, w.id, {
    title: 'Initialize synthetic research documents',
    operations: [
      {
        path: '/research/brief.md',
        baseRevision: null,
        content:
          "# Shared workspace protocol\n\nResearch question: how can independent agents collaborate without inheriting each other's authority?\n\n## Findings\n\n- Identity must be separate from the model provider.\n- Access follows explicit document scopes.\n- Handoffs transfer responsibility, never permissions.\n\nAll content in this workspace is synthetic demonstration data.\n",
      },
      {
        path: '/drafts/protocol.md',
        baseRevision: null,
        content:
          '# Workspace protocol\n\nAgents propose document changes. A human operator reviews and applies them.\n',
      },
      {
        path: '/private/operator-notes.md',
        baseRevision: null,
        content:
          '# Operator notes\n\nThis synthetic document is outside every demo agent domain.\n',
      },
    ],
  });
  s.approve(operator, w.id, initial.id);
  s.apply(operator, w.id, initial.id);
  s.createGrant(operator, w.id, {
    agentId: researcher.agent.id,
    scope: '/research',
    actions: ['read', 'write'],
    effect: 'allow',
  });
  s.createGrant(operator, w.id, {
    agentId: writer.agent.id,
    scope: '/research',
    actions: ['read'],
    effect: 'allow',
  });
  s.createGrant(operator, w.id, {
    agentId: writer.agent.id,
    scope: '/drafts',
    actions: ['read', 'write'],
    effect: 'allow',
  });
  s.createGrant(operator, w.id, {
    agentId: reviewer.agent.id,
    scope: '/drafts',
    actions: ['read', 'review'],
    effect: 'allow',
  });
  const draft = s.readDocument(operator, w.id, '/drafts/protocol.md');
  const proposal = s.propose(s.authenticateAgent(writer.token)!, w.id, {
    title: 'Clarify the agent handoff boundary',
    operations: [
      {
        path: draft.path,
        baseRevision: draft.currentRevision,
        content:
          draft.content +
          '\n## Handoff rules\n\nA receiving agent uses its own scoped token. Task assignment grants no additional file access. Every approved change is checked again before application.\n',
      },
    ],
  });
  s.addReview(
    s.authenticateAgent(reviewer.token)!,
    w.id,
    proposal.id,
    'The handoff boundary is clear. The operator should verify that scopes match the intended document domains.',
  );
  s.createTask(operator, w.id, {
    title: 'Validate the proposed protocol',
    instructions:
      'Review the pending draft against the workspace access model. Do not request operator credentials.',
    assigneeId: reviewer.agent.id,
  });
  writeFileSync(
    resolve(directory, 'demo-agents.json'),
    JSON.stringify({ workspaceId: w.id, researcher, writer, reviewer }, null, 2),
    { flag: 'wx', mode: 0o600 },
  );
  console.log(
    `Created synthetic demo workspace ${w.id}. Scoped tokens are in ignored data/demo-agents.json.`,
  );
} finally {
  s.close();
}
