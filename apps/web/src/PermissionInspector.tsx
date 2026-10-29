import { useEffect, useState } from 'react';
import type { Action } from '../../../packages/core/src/types.js';
import { Empty, ErrorMessage, Field, timestamp, useConsole } from './components.js';
import { useResource } from './pages.js';

const captions: Record<Action, string> = {
  read: 'Read',
  write: 'Propose edits',
  delete: 'Propose deletion',
  review: 'Add review',
};
const reasons = {
  allow: 'Matching allow',
  explicit_deny: 'Explicit deny',
  default_deny: 'No matching allow',
};

export function PermissionInspector() {
  const { data, client, wid, generation } = useConsole();
  const agents = data.agents.filter((agent) => !agent.revokedAt);
  const [selection, setSelection] = useState('');
  const selectionLoaded = !selection || agents.some((agent) => agent.id === selection);
  const agentId = (selectionLoaded ? selection : '') || agents[0]?.id || '';
  const [path, setPath] = useState('/drafts/example.md');
  const [submitted, setSubmitted] = useState<{
    agentId: string;
    path: string;
    attempt: number;
  } | null>(null);
  useEffect(() => {
    if (!selectionLoaded) {
      setSelection('');
      setSubmitted(null);
    }
  }, [selectionLoaded]);
  const valid = submitted && submitted.agentId === agentId && submitted.path === path;
  const report = useResource(valid ? JSON.stringify([wid, submitted]) : null, generation, () =>
    client.checkAccess(
      wid,
      (Object.keys(captions) as Action[]).map((action) => ({ path, action })),
      agentId,
    ),
  );
  return (
    <section className="permission-inspector" aria-label="Permission inspector">
      <h2>Inspect effective access</h2>
      <p className="muted">
        Check current policy for a virtual path. This preview grants no access and does not
        guarantee a proposal can be applied.
      </p>
      {!agents.length ? (
        <Empty title="No active agents loaded">
          Register an agent or load more agents to inspect its permissions.
        </Empty>
      ) : (
        <form
          className="access-form"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted((previous) => ({ agentId, path, attempt: (previous?.attempt ?? 0) + 1 }));
          }}
        >
          <Field label="Inspect agent">
            <select
              aria-label="Inspect agent"
              value={agentId}
              onChange={(event) => {
                setSelection(event.target.value);
                setSubmitted(null);
              }}
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name} · {agent.domain}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Inspect virtual path">
            <input
              required
              maxLength={512}
              value={path}
              onChange={(event) => {
                setPath(event.target.value);
                setSubmitted(null);
              }}
            />
          </Field>
          <button>Check access</button>
        </form>
      )}
      {report.loading && <p role="status">Checking current permissions...</p>}
      {report.error && (
        <>
          <ErrorMessage message={report.error} />
          <button className="quiet" onClick={report.retry}>
            Retry access check
          </button>
        </>
      )}
      {report.data && (
        <section aria-label="Access check results" aria-live="polite">
          <p>
            <code>{report.data.decisions[0]?.path}</code>{' '}
            <span className="muted">Checked {timestamp(report.data.evaluatedAt)}</span>
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Operation</th>
                  <th>Effective access</th>
                  <th>Policy requirements</th>
                </tr>
              </thead>
              <tbody>
                {report.data.decisions.map((decision) => (
                  <tr key={decision.action}>
                    <td>{captions[decision.action]}</td>
                    <td>
                      <strong>{decision.allowed ? 'Allowed' : 'Denied'}</strong>
                    </td>
                    <td>
                      <details>
                        <summary>Explain {decision.action}</summary>
                        {decision.requirements.map((requirement) => (
                          <div className="access-evidence" key={requirement.action}>
                            <p>
                              <strong>{requirement.action}</strong>: {reasons[requirement.reason]}
                            </p>
                            {requirement.evidence?.matchedGrantIds.map((id) => (
                              <code className="table-sub" key={id}>
                                Matched grant: {id}
                              </code>
                            ))}
                            {requirement.evidence?.ignoredGrants.map((grant) => (
                              <code className="table-sub" key={grant.grantId}>
                                Ignored {grant.reason} grant: {grant.grantId}
                              </code>
                            ))}
                            {requirement.evidence?.truncated && (
                              <p className="muted">
                                Showing the first 20 matched and 20 ignored grants. The decision
                                uses all applicable grants.
                              </p>
                            )}
                          </div>
                        ))}
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  );
}
