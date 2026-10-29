import { useRef, useState } from 'react';
import type { Document, RevisionMetadata } from '../../../packages/core/src/types.js';
import {
  Dialog,
  Empty,
  ErrorMessage,
  Field,
  PageControls,
  short,
  timestamp,
  useConsole,
} from './components.js';
import { usePage, useResource } from './pages.js';

export function Documents() {
  const {
    data,
    pages,
    client,
    wid,
    run,
    busy,
    navigate,
    generation,
    documentQuery,
    setDocumentQuery,
  } = useConsole();
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Document | 'new' | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const pending = useRef<{ fingerprint: string; key: string } | null>(null);
  const detail = useResource(selected ? `${wid}:${selected}` : null, generation, () =>
    client.read(wid, selected!, true),
  );
  const document = detail.data;
  async function propose(
    path: string,
    content: string | null,
    baseRevision: string | null,
    title: string,
  ) {
    const operations = [{ path, content, baseRevision }];
    const fingerprint = JSON.stringify({ title, operations });
    if (pending.current?.fingerprint !== fingerprint)
      pending.current = { fingerprint, key: crypto.randomUUID() };
    const ok = await run(
      () => client.propose(wid, title, operations, { idempotencyKey: pending.current!.key }),
      'Change proposed. Review it in Change sets.',
    );
    if (ok) {
      pending.current = null;
      setEditing(null);
      setHistoryOpen(false);
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
            value={documentQuery}
            onChange={(e) => {
              setDocumentQuery(e.target.value);
              setSelected(null);
              setHistoryOpen(false);
            }}
          />
        </label>
        <button onClick={() => setEditing('new')}>New document</button>
      </div>
      <div className="document-workbench">
        <section className="file-list" aria-label="Documents">
          <div className="list-heading">
            <span>Managed documents</span>
            <span>{data.documents.length} loaded</span>
          </div>
          {data.documents.map((doc) => (
            <button
              key={doc.path}
              aria-label={doc.path}
              className={`file-item ${selected === doc.path ? 'selected' : ''}`}
              onClick={() => {
                setSelected(doc.path);
                setHistoryOpen(false);
              }}
            >
              <code>{doc.path}</code>
              <small>{doc.deleted ? 'Deleted' : timestamp(doc.updatedAt)}</small>
            </button>
          ))}
          {!pages.documents.loading && !pages.documents.error && !data.documents.length && (
            <Empty title="No matching documents">
              Create a document proposal or change your search.
            </Empty>
          )}
          <PageControls state={pages.documents} label="documents" />
        </section>
        <section className="document-detail">
          {detail.loading && <p role="status">Loading document...</p>}
          {detail.error && (
            <>
              <ErrorMessage message={detail.error} />
              <button className="secondary" onClick={detail.retry}>
                Retry document
              </button>
            </>
          )}
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
                <button className="secondary" disabled={busy} onClick={() => setHistoryOpen(true)}>
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
                      void propose(
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
              {historyOpen && (
                <History
                  key={document.path}
                  document={document}
                  onRestore={async (rev) => {
                    const snapshot = await client.revision(wid, document.path, rev.id);
                    await propose(
                      document.path,
                      snapshot.content,
                      document.currentRevision,
                      `Restore ${document.path} to ${short(rev.id)}`,
                    );
                  }}
                />
              )}
            </>
          ) : (
            !selected && (
              <Empty title="Select a document">
                Inspect its content, compare revisions, or propose a change.
              </Empty>
            )
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
function History({
  document,
  onRestore,
}: {
  document: Document;
  onRestore: (revision: RevisionMetadata) => Promise<void>;
}) {
  const { client, wid, generation } = useConsole();
  const page = usePage(client, wid, 'history', { path: document.path }, generation);
  return (
    <section className="history">
      <h2>Version history</h2>
      <p className="muted">
        Restoring creates a new proposal. Existing history is preserved. Open a snapshot to read its
        content.
      </p>
      {page.items.map((rev) => (
        <HistoryRevision
          key={rev.id}
          revision={rev}
          currentRevision={document.currentRevision}
          onRestore={onRestore}
        />
      ))}
      <PageControls state={page} label="revisions" />
    </section>
  );
}
function HistoryRevision({
  revision: rev,
  currentRevision,
  onRestore,
}: {
  revision: RevisionMetadata;
  currentRevision: string;
  onRestore: (revision: RevisionMetadata) => Promise<void>;
}) {
  const { client, wid, generation, busy } = useConsole();
  const [opened, setOpened] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState('');
  const snapshot = useResource(opened ? `${wid}:${rev.path}:${rev.id}` : null, generation, () =>
    client.revision(wid, rev.path, rev.id),
  );
  return (
    <div className="revision">
      <div>
        <code>{short(rev.id)}</code>
        <span>
          {timestamp(rev.createdAt)} ·{' '}
          {rev.authorId === 'operator' ? 'Operator' : short(rev.authorId)}
        </span>
      </div>
      <div className="document-actions">
        <button className="secondary" disabled={snapshot.loading} onClick={() => setOpened(true)}>
          View snapshot
        </button>
        <button
          className="secondary"
          disabled={busy || restoring || rev.deleted || rev.id === currentRevision}
          onClick={async () => {
            setRestoring(true);
            setError('');
            try {
              await onRestore(rev);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not restore this revision.');
            } finally {
              setRestoring(false);
            }
          }}
        >
          Propose restore
        </button>
      </div>
      {restoring && <p role="status">Preparing restore...</p>}
      {snapshot.loading && <p role="status">Loading snapshot...</p>}
      {error && <ErrorMessage message={error} />}
      {snapshot.error && (
        <>
          <ErrorMessage message={snapshot.error} />
          <button className="secondary" onClick={snapshot.retry}>
            Retry snapshot
          </button>
        </>
      )}
      {snapshot.data && (
        <pre>{snapshot.data.deleted ? 'Deletion tombstone' : snapshot.data.content}</pre>
      )}
    </div>
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
