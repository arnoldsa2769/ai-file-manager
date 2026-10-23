import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import type { Overview } from '../../../packages/core/src/types.js';
import type { WorkspaceClient } from '../../../packages/sdk/src/index.js';
export type View =
  'Overview' | 'Documents' | 'Agents' | 'Permissions' | 'Change sets' | 'Tasks' | 'Activity';
export interface ConsoleState {
  data: Overview;
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
