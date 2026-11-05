import { useEffect, useRef, useState } from 'react';
import type { ChangeSet, Revision } from '../../../packages/core/src/types.js';
import {
  Empty,
  ErrorMessage,
  Field,
  PageControls,
  Status,
  short,
  timestamp,
  useConsole,
} from './components.js';
import { useResource } from './pages.js';
import { ReviewNotes } from './ReviewNotes.js';
export function Changes() {
  const {
    data,
    pages,
    client,
    wid,
    generation,
    changeStatus: filter,
    setChangeStatus: setFilter,
  } = useConsole();
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useResource(selected ? `${wid}:${selected}` : null, generation, () =>
    client.change(wid, selected!),
  );
  const change = detail.data;
  const changes = data.changes;
  return (
    <>
      <div className="section-toolbar">
        <p className="muted">Immutable proposals. Explicit approval. Atomic application.</p>
        <label className="filter">
          Status{' '}
          <select
            aria-label="Change status"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setSelected(null);
            }}
          >
            <option value="all">All changes</option>
            {['pending', 'approved', 'applied', 'rejected'].map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="changes-layout">
        <section className="change-list" aria-label="Change sets">
          {changes.map((c) => (
            <button
              key={c.id}
              className={`change-item ${selected === c.id ? 'selected' : ''}`}
              onClick={() => setSelected(c.id)}
            >
              <span className="change-title">{c.title}</span>
              <span>
                <Status value={c.status} />
                <small>
                  {c.operationCount} {c.operationCount === 1 ? 'file' : 'files'} ·{' '}
                  {timestamp(c.createdAt)}
                </small>
              </span>
            </button>
          ))}
          {!pages.changes.loading && !pages.changes.error && !changes.length && (
            <Empty title="No changes in this view">
              Agent proposals and operator edits appear here.
            </Empty>
          )}
          <PageControls state={pages.changes} label="change sets" />
        </section>
        <section className="change-detail">
          {detail.loading && <p role="status">Loading change...</p>}
          {detail.error && (
            <>
              <ErrorMessage message={detail.error} />
              <button className="secondary" onClick={detail.retry}>
                Retry change
              </button>
            </>
          )}
          {change ? (
            <ChangeDetail key={change.id} change={change} />
          ) : (
            !selected && (
              <Empty title="Review a change set">
                Select a proposal to inspect its exact content and approval state.
              </Empty>
            )
          )}
        </section>
      </div>
    </>
  );
}
function ChangeDetail({ change }: { change: ChangeSet }) {
  const { client, wid, data, run, busy, generation } = useConsole();
  const applyKey = useRef(crypto.randomUUID());
  const [bases, setBases] = useState<Record<string, Revision | undefined>>({});
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoaded(false);
    setError('');
    void Promise.all(
      change.operations.map(async (op) => ({
        path: op.path,
        revision: op.baseRevision
          ? await client.revision(wid, op.path, op.baseRevision)
          : undefined,
      })),
    )
      .then((history) => {
        if (active) {
          setBases(Object.fromEntries(history.map((x) => [x.path, x.revision])));
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [client, wid, change.id, generation, attempt]);
  const author =
    change.authorId === 'operator'
      ? 'Operator'
      : (data.agents.find((a) => a.id === change.authorId)?.name ?? short(change.authorId));
  const missingBase = change.operations.some((op) => op.baseRevision && !bases[op.path]);
  return (
    <>
      <div className="detail-head">
        <div>
          <h2>{change.title}</h2>
          <p className="muted">
            Proposed by {author} · {timestamp(change.createdAt)}
          </p>
        </div>
        <Status value={change.status} />
      </div>
      <div className="digest">
        <span>Content fingerprint</span>
        <code>{change.digest}</code>
      </div>
      {error && (
        <div>
          <p role="alert" className="error">
            {error}
          </p>
          <button className="secondary" onClick={() => setAttempt((value) => value + 1)}>
            Retry snapshots
          </button>
        </div>
      )}
      {!loaded
        ? !error && <p role="status">Loading exact revision snapshots...</p>
        : change.operations.map((op) => (
            <section className="diff" key={op.path}>
              <div className="diff-heading">
                <code>{op.path}</code>
                <span>
                  {op.content === null ? 'Delete' : op.baseRevision ? 'Update' : 'Create'}
                </span>
              </div>
              <div className="diff-columns">
                <div>
                  <h3>Before · {op.baseRevision ? short(op.baseRevision) : 'new document'}</h3>
                  <pre>
                    {bases[op.path]?.deleted
                      ? 'Deletion tombstone'
                      : (bases[op.path]?.content ??
                        (op.baseRevision ? 'Base revision unavailable.' : 'No previous content.'))}
                  </pre>
                </div>
                <div>
                  <h3>Proposed</h3>
                  <pre>{op.content ?? 'Document will be deleted.'}</pre>
                </div>
              </div>
            </section>
          ))}
      <div className="approval-bar">
        {change.status === 'pending' && (
          <button
            disabled={busy || !loaded || missingBase}
            onClick={() =>
              run(
                () =>
                  client.request('POST', `/v1/workspaces/${wid}/changes/${change.id}/approve`, {}),
                'Change approved. Apply it when ready.',
              )
            }
          >
            Approve change
          </button>
        )}
        {change.status === 'approved' && (
          <button
            disabled={busy || !loaded || missingBase}
            onClick={() =>
              run(
                () => client.apply(wid, change.id, { idempotencyKey: applyKey.current }),
                'Change applied successfully.',
              )
            }
          >
            Apply change
          </button>
        )}
        {['pending', 'approved'].includes(change.status) && (
          <button
            className="secondary danger"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  client.request('POST', `/v1/workspaces/${wid}/changes/${change.id}/reject`, {}),
                'Change rejected.',
              )
            }
          >
            Reject change
          </button>
        )}
        <p className="muted">Application rechecks permissions and base revisions.</p>
      </div>
      <ReviewNotes changeId={change.id} />
    </>
  );
}
