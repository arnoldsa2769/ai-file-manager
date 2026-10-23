export type Action = 'read' | 'write' | 'delete' | 'review';
export type Principal =
  { kind: 'operator'; id: 'operator' } | { kind: 'agent'; id: string; workspaceId: string };
export const operator: Principal = { kind: 'operator', id: 'operator' };
export interface Workspace {
  id: string;
  name: string;
  createdAt: string;
}
export interface Agent {
  id: string;
  workspaceId: string;
  name: string;
  domain: string;
  provider: string;
  revokedAt: string | null;
  createdAt: string;
}
export interface Grant {
  id: string;
  workspaceId: string;
  agentId: string;
  scope: string;
  actions: Action[];
  effect: 'allow' | 'deny';
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}
export interface Operation {
  path: string;
  baseRevision: string | null;
  content: string | null;
}
export interface Document {
  workspaceId: string;
  path: string;
  currentRevision: string;
  content: string | null;
  deleted: boolean;
  updatedAt: string;
}
export interface Revision {
  id: string;
  workspaceId: string;
  path: string;
  content: string | null;
  deleted: boolean;
  parentId: string | null;
  authorId: string;
  changeSetId: string;
  createdAt: string;
}
export interface ChangeSet {
  id: string;
  workspaceId: string;
  title: string;
  authorId: string;
  operations: Operation[];
  digest: string;
  approvedDigest: string | null;
  status: 'pending' | 'approved' | 'applied' | 'rejected';
  createdAt: string;
  approvedAt: string | null;
  appliedAt: string | null;
}
export interface Review {
  id: string;
  workspaceId: string;
  changeSetId: string;
  authorId: string;
  body: string;
  createdAt: string;
}
export interface Task {
  id: string;
  workspaceId: string;
  title: string;
  instructions: string;
  assigneeId: string;
  status: 'open' | 'in_progress' | 'done';
  createdAt: string;
  updatedAt: string;
}
export interface Activity {
  id: string;
  workspaceId: string;
  actorId: string;
  action: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}
export interface Overview {
  workspace: Workspace;
  agents: Agent[];
  grants: Grant[];
  documents: Document[];
  changes: ChangeSet[];
  tasks: Task[];
  activity: Activity[];
}
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}
