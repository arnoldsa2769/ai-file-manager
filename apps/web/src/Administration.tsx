import { useState } from 'react';
import { PermissionInspector } from './PermissionInspector.js';
import type { Action, Agent, Task } from '../../../packages/core/src/types.js';
import {
  Dialog,
  Empty,
  Field,
  PageControls,
  Status,
  short,
  timestamp,
  useConsole,
} from './components.js';
export function Agents() {
  const { data, pages, client, wid, run, busy } = useConsole();
  const [creating, setCreating] = useState(false);
  const [credential, setCredential] = useState<{ name: string; token: string } | null>(null);
  return (
    <>
      <div className="section-toolbar">
        <p className="muted">Each identity has its own token and an explicit domain.</p>
        <button onClick={() => setCreating(true)}>Register agent</button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Domain</th>
              <th>Provider</th>
              <th>Status</th>
              <th>Access</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.agents.map((agent) => (
              <tr key={agent.id}>
                <td>
                  <strong>{agent.name}</strong>
                  <code className="table-sub">{short(agent.id)}</code>
                </td>
                <td>{agent.domain}</td>
                <td>{agent.provider}</td>
                <td>
                  <Status value={agent.revokedAt ? 'revoked' : 'active'} />
                </td>
                <td>
                  {
                    data.grants.filter(
                      (g) =>
                        g.agentId === agent.id &&
                        !g.revokedAt &&
                        (!g.expiresAt || Date.parse(g.expiresAt) > Date.now()),
                    ).length
                  }{' '}
                  loaded grants
                </td>
                <td>
                  <button
                    className="quiet danger"
                    disabled={busy || Boolean(agent.revokedAt)}
                    onClick={() => {
                      if (
                        confirm(
                          `Revoke ${agent.name}? Its token and pending proposal authority will stop working.`,
                        )
                      )
                        void run(
                          () =>
                            client.request(
                              'POST',
                              `/v1/workspaces/${wid}/agents/${agent.id}/revoke`,
                              {},
                            ),
                          'Agent revoked.',
                        );
                    }}
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PageControls state={pages.agents} label="agents" />
      {!pages.agents.loading && !pages.agents.error && !data.agents.length && (
        <Empty title="No agents registered">
          Create a scoped identity for each connected AI tool.
        </Empty>
      )}
      {creating && (
        <Dialog title="Register agent" onClose={() => setCreating(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                const result = await client.request<{ agent: Agent; token: string }>(
                  'POST',
                  `/v1/workspaces/${wid}/agents`,
                  { name: f.get('name'), domain: f.get('domain'), provider: f.get('provider') },
                );
                setCreating(false);
                setCredential({ name: result.agent.name, token: result.token });
              });
            }}
          >
            <Field label="Agent name">
              <input name="name" required maxLength={100} placeholder="Research agent" />
            </Field>
            <Field label="Responsibility domain">
              <input name="domain" required maxLength={100} placeholder="Research" />
            </Field>
            <Field label="Provider or framework">
              <input name="provider" required maxLength={100} placeholder="External agent" />
            </Field>
            <p className="muted">New agents have no document access until you add grants.</p>
            <div className="form-actions">
              <button disabled={busy}>Create identity</button>
            </div>
          </form>
        </Dialog>
      )}
      {credential && (
        <Dialog title={`Token for ${credential.name}`} onClose={() => setCredential(null)}>
          <p>
            This token is shown once. Save it in your agent's secret storage. The server stores only
            its digest.
          </p>
          <Field label="Agent token">
            <textarea readOnly rows={3} value={credential.token} />
          </Field>
          <div className="form-actions">
            <button onClick={() => setCredential(null)}>I have saved this token</button>
          </div>
        </Dialog>
      )}
    </>
  );
}
export function Permissions() {
  const { data, pages, client, wid, run, busy } = useConsole();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className="section-toolbar">
        <p className="muted">Default deny. Matching denies override allows.</p>
        <button disabled={!data.agents.some((a) => !a.revokedAt)} onClick={() => setCreating(true)}>
          Add grant
        </button>
      </div>
      <PageControls state={pages.agents} label="agents" />
      <div className="policy-note">
        <strong>Scopes follow directory boundaries.</strong>
        <span>
          <code>/research</code> includes <code>/research/brief.md</code>, and excludes{' '}
          <code>/research-private</code>. A task handoff adds no permissions.
        </span>
      </div>
      <PermissionInspector />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Scope</th>
              <th>Capabilities</th>
              <th>Effect</th>
              <th>Lifetime</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {data.grants.map((grant) => (
              <tr key={grant.id}>
                <td>
                  {data.agents.find((a) => a.id === grant.agentId)?.name ?? short(grant.agentId)}
                </td>
                <td>
                  <code>{grant.scope}</code>
                </td>
                <td>
                  <div className="capabilities">
                    {grant.actions.map((action) => (
                      <span key={action}>{action}</span>
                    ))}
                  </div>
                </td>
                <td>
                  <Status value={grant.effect} />
                </td>
                <td>
                  {grant.revokedAt
                    ? 'Revoked'
                    : grant.expiresAt
                      ? Date.parse(grant.expiresAt) <= Date.now()
                        ? 'Expired'
                        : timestamp(grant.expiresAt)
                      : 'Until revoked'}
                </td>
                <td>
                  <button
                    className="quiet danger"
                    disabled={busy || Boolean(grant.revokedAt)}
                    onClick={() =>
                      run(
                        () =>
                          client.request(
                            'POST',
                            `/v1/workspaces/${wid}/grants/${grant.id}/revoke`,
                            {},
                          ),
                        'Grant revoked. Approved changes will be rechecked.',
                      )
                    }
                  >
                    Revoke
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PageControls state={pages.grants} label="grants" />
      {!pages.grants.loading && !pages.grants.error && !data.grants.length && (
        <Empty title="No document access granted">Agents start with no file permissions.</Empty>
      )}
      {creating && (
        <Dialog title="Add scoped grant" onClose={() => setCreating(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await client.request('POST', `/v1/workspaces/${wid}/grants`, {
                  agentId: f.get('agentId'),
                  scope: f.get('scope'),
                  actions: f.getAll('actions') as Action[],
                  effect: f.get('effect'),
                  expiresAt: f.get('expiresAt')
                    ? new Date(String(f.get('expiresAt'))).toISOString()
                    : null,
                });
                setCreating(false);
              }, 'Scoped grant created.');
            }}
          >
            <Field label="Agent">
              <select name="agentId">
                {data.agents
                  .filter((a) => !a.revokedAt)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.domain}
                    </option>
                  ))}
              </select>
            </Field>
            <PageControls state={pages.agents} label="agents" />
            <Field label="Virtual path scope">
              <input name="scope" required defaultValue="/research" />
            </Field>
            <fieldset className="checkbox-group">
              <legend>Capabilities</legend>
              {['read', 'write', 'delete', 'review'].map((action) => (
                <label key={action}>
                  <input
                    type="checkbox"
                    name="actions"
                    value={action}
                    defaultChecked={action === 'read'}
                  />
                  {action}
                </label>
              ))}
            </fieldset>
            <Field label="Effect">
              <select name="effect">
                <option value="allow">Allow</option>
                <option value="deny">Deny</option>
              </select>
            </Field>
            <Field label="Expiration (optional, local time)">
              <input type="datetime-local" name="expiresAt" />
            </Field>
            <p className="muted">Writes need read and write. Deletions need read and delete.</p>
            <div className="form-actions">
              <button disabled={busy}>Save grant</button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
export function Tasks() {
  const { data, pages, client, wid, run, busy } = useConsole();
  const [creating, setCreating] = useState(false);
  return (
    <>
      <div className="section-toolbar">
        <p className="muted">
          Delegate responsibility while preserving each agent's access boundary.
        </p>
        <button disabled={!data.agents.some((a) => !a.revokedAt)} onClick={() => setCreating(true)}>
          Create task
        </button>
      </div>
      <PageControls state={pages.agents} label="agents" />
      <div className="task-list">
        {data.tasks.map((task) => (
          <article key={task.id} className="task">
            <div className="detail-head">
              <div>
                <h2>{task.title}</h2>
                <code>{short(task.id)}</code>
              </div>
              <Status value={task.status} />
            </div>
            <p>{task.instructions}</p>
            <div className="task-controls">
              <Field label="Assigned agent">
                <select
                  aria-label={`Assignee for ${task.title}`}
                  value={task.assigneeId}
                  disabled={busy}
                  onChange={(e) =>
                    run(
                      () => client.updateTask(wid, task.id, { assigneeId: e.target.value }),
                      'Task handed off. File permissions were not transferred.',
                    )
                  }
                >
                  <option hidden value={task.assigneeId}>
                    {data.agents.find((a) => a.id === task.assigneeId)?.name ??
                      short(task.assigneeId)}
                  </option>
                  {data.agents
                    .filter((a) => !a.revokedAt)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Task status">
                <select
                  aria-label={`Status for ${task.title}`}
                  value={task.status}
                  disabled={busy}
                  onChange={(e) =>
                    run(
                      () =>
                        client.updateTask(wid, task.id, {
                          status: e.target.value as Task['status'],
                        }),
                      'Task status updated.',
                    )
                  }
                >
                  {['open', 'in_progress', 'done'].map((status) => (
                    <option key={status} value={status}>
                      {status.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </article>
        ))}
      </div>
      <PageControls state={pages.tasks} label="tasks" />
      {!pages.tasks.loading && !pages.tasks.error && !data.tasks.length && (
        <Empty title="No tasks assigned">Create a bounded task for an active agent.</Empty>
      )}
      {creating && (
        <Dialog title="Create agent task" onClose={() => setCreating(false)}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(async () => {
                await client.request('POST', `/v1/workspaces/${wid}/tasks`, {
                  title: f.get('title'),
                  instructions: f.get('instructions'),
                  assigneeId: f.get('assigneeId'),
                });
                setCreating(false);
              }, 'Task created.');
            }}
          >
            <Field label="Task title">
              <input name="title" required maxLength={200} />
            </Field>
            <Field label="Instructions">
              <textarea name="instructions" required maxLength={8000} rows={5} />
            </Field>
            <Field label="Assigned agent">
              <select name="assigneeId">
                {data.agents
                  .filter((a) => !a.revokedAt)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </Field>
            <PageControls state={pages.agents} label="agents" />
            <div className="form-actions">
              <button disabled={busy}>Assign task</button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
export function Activity() {
  const { data, pages } = useConsole();
  return (
    <>
      <p className="muted">
        Mutation records, loaded in pages. API append-only; not tamper-proof against the host
        administrator.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Event</th>
              <th>Actor</th>
              <th>Resource</th>
              <th>Recorded</th>
            </tr>
          </thead>
          <tbody>
            {data.activity.map((event) => (
              <tr key={event.id}>
                <td>
                  <strong>{event.action}</strong>
                  <small className="table-sub">{JSON.stringify(event.metadata)}</small>
                </td>
                <td>
                  {event.actorId === 'operator'
                    ? 'Operator'
                    : (data.agents.find((a) => a.id === event.actorId)?.name ??
                      short(event.actorId))}
                </td>
                <td>
                  <code>{short(event.resourceId)}</code>
                </td>
                <td>{timestamp(event.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PageControls state={pages.activity} label="activity" />
    </>
  );
}
