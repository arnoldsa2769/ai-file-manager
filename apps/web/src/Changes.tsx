import { useEffect, useState } from 'react';
import type { ChangeSet, Review, Revision } from '../../../packages/core/src/types.js';
import { Empty, Field, Status, short, timestamp, useConsole } from './components.js';
export function Changes() {
  const { data, client, wid, run, busy } = useConsole();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const change = data.changes.find((c) => c.id === selected);
  const changes = data.changes.filter((c) => filter === 'all' || c.status === filter);
  return (
    <>
      <div className="section-toolbar">
        <p className="muted">Immutable proposals. Explicit approval. Atomic application.</p>
        <label className="filter">
          Status{' '}
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
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
                  {c.operations.length} {c.operations.length === 1 ? 'file' : 'files'} ·{' '}
                  {timestamp(c.createdAt)}
                </small>
              </span>
            </button>
          ))}
          {!changes.length && (
            <Empty title="No changes in this view">
              Agent proposals and operator edits appear here.
            </Empty>
          )}
        </section>
        <section className="change-detail">
          {change ? (
            <ChangeDetail key={change.id} change={change} />
          ) : (
            <Empty title="Review a change set">
              Select a proposal to inspect its exact content and approval state.
            </Empty>
          )}
        </section>
      </div>
    </>
  );
}
function ChangeDetail({ change }: { change: ChangeSet }) {
  const { client, wid, data, run, busy } = useConsole();
  const [bases, setBases] = useState<Record<string, Revision | undefined>>({});
  const [reviews, setReviews] = useState<Review[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoaded(false);
    setError('');
    void Promise.all([
      Promise.all(
        change.operations.map(async (op) => ({
          path: op.path,
          revision: op.baseRevision
            ? await client.revision(wid, op.path, op.baseRevision)
            : undefined,
        })),
      ),
      client.request<Review[]>('GET', `/v1/workspaces/${wid}/changes/${change.id}/reviews`),
    ])
      .then(([history, notes]) => {
        if (active) {
          setBases(Object.fromEntries(history.map((x) => [x.path, x.revision])));
          setReviews(notes);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [client, wid, change.id, attempt]);
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
                () =>
                  client.request('POST', `/v1/workspaces/${wid}/changes/${change.id}/apply`, {}),
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
      <section className="reviews">
        <h2>Review notes</h2>
        {reviews.map((review) => (
          <article key={review.id}>
            <div>
              <strong>
                {review.authorId === 'operator'
                  ? 'Operator'
                  : (data.agents.find((a) => a.id === review.authorId)?.name ??
                    short(review.authorId))}
              </strong>
              <small>{timestamp(review.createdAt)}</small>
            </div>
            <p>{review.body}</p>
          </article>
        ))}
        {!reviews.length && (
          <p className="muted">No review notes yet. Agent reviews are advisory.</p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await client.review(wid, change.id, note);
              setReviews(
                await client.request<Review[]>(
                  'GET',
                  `/v1/workspaces/${wid}/changes/${change.id}/reviews`,
                ),
              );
              setNote('');
            }, 'Review note added.');
          }}
        >
          <Field label="Review note">
            <textarea
              value={note}
              required
              maxLength={4000}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </Field>
          <button className="secondary" disabled={busy || !note.trim()}>
            Add review note
          </button>
        </form>
      </section>
    </>
  );
}
