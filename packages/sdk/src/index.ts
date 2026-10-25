import type {
  ChangeSet,
  Document,
  Operation,
  Principal,
  Review,
  Revision,
  Task,
  Workspace,
  Overview,
} from '../../core/src/types.js';
export class WorkspaceApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'WorkspaceApiError';
  }
}
export class WorkspaceClient {
  private readonly baseUrl: string;
  constructor(options: { baseUrl: string; token: string; timeoutMs?: number }) {
    const url = new URL(options.baseUrl);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('Use an HTTP(S) base URL without credentials, query, or fragment.');
    this.baseUrl = url.toString().replace(/\/$/, '');
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? 15000;
  }
  private readonly token: string;
  private readonly timeoutMs: number;
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!path.startsWith('/v1/') || path.includes('://'))
      throw new Error('SDK paths must remain within /v1/.');
    const response = await fetch(this.baseUrl + path, {
      method,
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const payload = (await response.json()) as T & { error?: { code: string; message: string } };
    if (!response.ok)
      throw new WorkspaceApiError(
        payload.error?.code ?? 'HTTP_ERROR',
        payload.error?.message ?? 'Request failed.',
        response.status,
      );
    return payload;
  }
  private root(wid: string) {
    return `/v1/workspaces/${encodeURIComponent(wid)}`;
  }
  me() {
    return this.request<Principal>('GET', '/v1/me');
  }
  workspaces() {
    return this.request<Workspace[]>('GET', '/v1/workspaces');
  }
  overview(wid: string) {
    return this.request<Overview>('GET', `${this.root(wid)}/overview`);
  }
  documents(wid: string) {
    return this.request<Document[]>('GET', `${this.root(wid)}/documents`);
  }
  read(wid: string, path: string, includeDeleted = false) {
    return this.request<Document>(
      'GET',
      `${this.root(wid)}/document?path=${encodeURIComponent(path)}&includeDeleted=${includeDeleted}`,
    );
  }
  history(wid: string, path: string) {
    return this.request<Revision[]>(
      'GET',
      `${this.root(wid)}/history?path=${encodeURIComponent(path)}`,
    );
  }
  revision(wid: string, path: string, revisionId: string) {
    return this.request<Revision>(
      'GET',
      `${this.root(wid)}/revision?path=${encodeURIComponent(path)}&revisionId=${encodeURIComponent(revisionId)}`,
    );
  }
  propose(wid: string, title: string, operations: Operation[]) {
    return this.request<ChangeSet>('POST', `${this.root(wid)}/changes`, { title, operations });
  }
  changes(wid: string) {
    return this.request<ChangeSet[]>('GET', `${this.root(wid)}/changes`);
  }
  change(wid: string, id: string) {
    return this.request<ChangeSet>('GET', `${this.root(wid)}/changes/${encodeURIComponent(id)}`);
  }
  review(wid: string, id: string, body: string) {
    return this.request<Review>(
      'POST',
      `${this.root(wid)}/changes/${encodeURIComponent(id)}/reviews`,
      { body },
    );
  }
  tasks(wid: string) {
    return this.request<Task[]>('GET', `${this.root(wid)}/tasks`);
  }
  updateTask(wid: string, id: string, update: { assigneeId?: string; status?: Task['status'] }) {
    return this.request<Task>('PATCH', `${this.root(wid)}/tasks/${encodeURIComponent(id)}`, update);
  }
}
