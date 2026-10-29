import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import type { Collections, WorkspaceSummary } from '../../../packages/core/src/types.js';
import type { WorkspaceClient } from '../../../packages/sdk/src/index.js';
import type { PageState } from './pages.js';
export type View =
  'Overview' | 'Documents' | 'Agents' | 'Permissions' | 'Change sets' | 'Tasks' | 'Activity';
export interface ConsoleState {
  data: WorkspaceSummary & { [K in Exclude<keyof Collections, 'history'>]: Collections[K][] };
  pages: { [K in Exclude<keyof Collections, 'history'>]: PageState<Collections[K]> };
  generation: number;
  documentQuery: string;
  setDocumentQuery: (query: string) => void;
  changeStatus: string;
  setChangeStatus: (status: string) => void;
  client: WorkspaceClient;
  wid: string;
  busy: boolean;
  error: string;
  run: (fn: () => Promise<unknown>, message?: string) => Promise<boolean>;
  navigate: (view: View) => void;
}
export const ConsoleContext = createContext<ConsoleState | null>(null);
export function useConsole() {
  const context = useContext(ConsoleContext);
  if (!context) throw new Error('Missing console context.');
  return context;
}
export function short(id: string) {
  return id.slice(0, 8);
}
export function timestamp(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
export function Status({ value }: { value: string }) {
  return (
    <span className={`status status-${value.replace(/[^a-z_]/g, '')}`}>
      {value.replaceAll('_', ' ')}
    </span>
  );
}
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
    </div>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const context = useContext(ConsoleContext);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} onCancel={onClose} aria-label={title}>
      <div className="dialog-head">
        <h2>{title}</h2>
        <button className="quiet" onClick={onClose}>
          Close
        </button>
      </div>
      {context?.error && <ErrorMessage message={context.error} />}
      {children}
    </dialog>
  );
}
export function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="error" role="alert">
      {message}
    </div>
  );
}
export function PageControls({ state, label }: { state: PageState<unknown>; label: string }) {
  return (
    <div className="page-controls" aria-label={`${label} pagination`}>
      {state.error && <ErrorMessage message={state.error} />}
      {state.loading && <p role="status">Loading {label}...</p>}
      {state.error && !state.nextCursor && (
        <button type="button" className="secondary" onClick={state.retry}>
          Retry {label}
        </button>
      )}
      {state.nextCursor && (
        <button
          type="button"
          className="secondary"
          disabled={state.loading}
          onClick={() => void state.loadMore()}
        >
          {state.error ? `Retry more ${label}` : `Load more ${label}`}
        </button>
      )}
    </div>
  );
}
