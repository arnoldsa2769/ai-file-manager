import { useState } from 'react';
import type { Document, Revision } from '../../../packages/core/src/types.js';
import { Dialog, Empty, Field, short, timestamp, useConsole } from './components.js';
export function Documents() {
  const { data, client, wid, run, busy, navigate } = useConsole();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Document | 'new' | null>(null);
  const [history, setHistory] = useState<{ path: string; revisions: Revision[] } | null>(null);
  const docs = data.documents.filter((d) => d.path.toLowerCase().includes(query.toLowerCase()));
  const document = data.documents.find((d) => d.path === selected);
  async function propose(
    path: string,
    content: string | null,
    baseRevision: string | null,
    title: string,
  ) {
    const ok = await run(
      () => client.propose(wid, title, [{ path, content, baseRevision }]),
      'Change proposed. Review it in Change sets.',
    );
    if (ok) {
      setEditing(null);
      setHistory(null);
      navigate('Change sets');
    }
  }
  return (
    <>
      <div className="section-toolbar">
        <label className="search">
          <span className="sr-only">Search documents</span>
          <input
            placeholder="Search by virtual path..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button onClick={() => setEditing('new')}>New document</button>
      </div>
      <div className="document-workbench">
        <section className="file-list" aria-label="Documents">
          <div className="list-heading">
            <span>Managed documents</span>
            <span>{docs.length}</span>
          </div>
          {docs.map((doc) => (
            <button
              key={doc.path}
              aria-label={doc.path}
              className={`file-item ${selected === doc.path ? 'selected' : ''}`}
              onClick={() => {
                setSelected(doc.path);
                setHistory(null);
              }}
            >
              <code>{doc.path}</code>
              <small>{doc.deleted ? 'Deleted' : timestamp(doc.updatedAt)}</small>
            </button>
          ))}
          {!docs.length && (
            <Empty title="No matching documents">
              Create a document proposal to start versioning.
            </Empty>
          )}
        </section>
        <section className="document-detail">
          {document ? (
            <>
              <div className="detail-head">
                <div>
                  <h2>{document.path.split('/').pop()}</h2>
                  <code>{document.path}</code>
                </div>
                <span className="muted">
                  {document.deleted ? 'Deleted' : 'Current revision'}{' '}
                  <code>{short(document.currentRevision)}</code>
                </span>
              </div>
              <div className="document-actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      setHistory({
                        path: document.path,
                        revisions: await client.history(wid, document.path),
                      });
                    })
                  }
                >
                  Version history
                </button>
                <button disabled={busy || document.deleted} onClick={() => setEditing(document)}>
                  Propose edit
                </button>
                {!document.deleted && (
                  <button
                    className="danger quiet"
                    disabled={busy}
                    onClick={() =>
                      propose(
                        document.path,
                        null,
                        document.currentRevision,
                        `Delete ${document.path}`,
                      )
                    }
                  >
                    Propose deletion
                  </button>
                )}
              </div>
              <pre className="document-content">
                {document.deleted
                  ? 'This document has been deleted. Open version history to restore an earlier revision.'
                  : document.content}
              </pre>
              {history?.path === document.path && (
                <section className="history">
                  <h2>Version history</h2>
                  <p className="muted">
                    Restoring creates a new proposal. Existing history is preserved.
                  </p>
                  {history.revisions
                    .filter((rev) => rev.path === document.path)
                    .map((rev) => (
                      <div key={rev.id} className="revision">
                        <div>
                          <code>{short(rev.id)}</code>
                          <span>
                            {timestamp(rev.createdAt)} ·{' '}
                            {rev.authorId === 'operator' ? 'Operator' : short(rev.authorId)}
                          </span>
                        </div>
                        <button
                          className="secondary"
                          disabled={busy || rev.deleted || rev.id === document.currentRevision}
                          onClick={() =>
                            propose(
                              document.path,
                              rev.content,
                              document.currentRevision,
                              `Restore ${document.path} to ${short(rev.id)}`,
                            )
                          }
                        >
                          Propose restore
                        </button>
                        <pre>{rev.deleted ? 'Deletion tombstone' : rev.content}</pre>
                      </div>
                    ))}
                </section>
              )}
            </>
          ) : (
            <Empty title="Select a document">
              Inspect its content, compare revisions, or propose a change.
            </Empty>
          )}
        </section>
      </div>
      {editing && (
        <Editor
          key={editing === 'new' ? 'new' : editing.path}
          document={editing}
          onClose={() => setEditing(null)}
          onSubmit={propose}
          busy={busy}
        />
      )}
    </>
  );
}
function Editor({
  document,
  onClose,
  onSubmit,
  busy,
}: {
  document: Document | 'new';
  onClose: () => void;
  onSubmit: (path: string, content: string, base: string | null, title: string) => Promise<void>;
  busy: boolean;
}) {
  const [path, setPath] = useState(document === 'new' ? '/drafts/untitled.md' : document.path);
  const [content, setContent] = useState(document === 'new' ? '' : (document.content ?? ''));
  const [title, setTitle] = useState(
    document === 'new' ? 'Create document' : `Update ${document.path}`,
  );
  return (
    <Dialog
      title={document === 'new' ? 'New document proposal' : 'Edit document proposal'}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSubmit(path, content, document === 'new' ? null : document.currentRevision, title);
        }}
      >
        <Field label="Change title">
          <input
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Virtual path">
          <input
            required
            value={path}
            readOnly={document !== 'new'}
            onChange={(e) => setPath(e.target.value)}
            pattern="/.*"
          />
        </Field>
        <Field label="Document content">
          <textarea
            className="editor"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={14}
          />
        </Field>
        <p className="muted">
          This submits an immutable proposal. Approval and application happen separately.
        </p>
        <div className="form-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button disabled={busy}>Submit proposal</button>
        </div>
      </form>
    </Dialog>
  );
}
