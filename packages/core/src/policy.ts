import {
  DomainError,
  type Action,
  type Grant,
  type AccessEvidence,
  type AccessRequirement,
} from './types.js';
export function canonicalPath(path: string, scope = false): string {
  if (
    typeof path !== 'string' ||
    !path.isWellFormed() ||
    path.length > 512 ||
    !path.startsWith('/') ||
    path !== path.normalize('NFC') ||
    /[\\%\x00-\x1f\x7f]/.test(path)
  ) {
    throw new DomainError('INVALID_PATH', 'Use a canonical absolute virtual path.');
  }
  if (path === '/' && scope) return path;
  if (
    path === '/' ||
    path.endsWith('/') ||
    path
      .split('/')
      .slice(1)
      .some((part) => !part || part === '.' || part === '..')
  ) {
    throw new DomainError('INVALID_PATH', 'Empty segments and traversal are not allowed.');
  }
  return path;
}
export function allowed(grants: Grant[], action: Action, path: string, now = new Date()): boolean {
  return compilePolicy(grants, now).allows(action, path);
}
export const actions: readonly Action[] = ['read', 'write', 'delete', 'review'];
export function compilePolicy(grants: Grant[], evaluatedAt = new Date()) {
  const at = evaluatedAt.getTime();
  if (!Number.isFinite(at))
    throw new DomainError('INVALID_INPUT', 'A valid policy evaluation time is required.');
  type Rule = {
    id: string;
    scope: string;
    effect: Grant['effect'];
    ignored?: 'revoked' | 'expired';
  };
  const rules: Record<Action, Rule[]> = { read: [], write: [], delete: [], review: [] };
  for (const grant of grants) {
    const rule: Rule = {
      id: grant.id,
      scope: grant.scope,
      effect: grant.effect,
      ignored: grant.revokedAt
        ? 'revoked'
        : grant.expiresAt && !(Date.parse(grant.expiresAt) > at)
          ? 'expired'
          : undefined,
    };
    for (const action of actions) if (grant.actions.includes(action)) rules[action].push(rule);
  }
  function evaluate(
    action: Action,
    path: string,
    evidence?: AccessEvidence,
  ): Omit<AccessRequirement, 'evidence'> {
    canonicalPath(path);
    if (!actions.includes(action))
      throw new DomainError('INVALID_INPUT', 'Unknown document action.');
    let allow = false;
    let deny = false;
    for (const rule of rules[action]) {
      if (rule.scope !== '/' && path !== rule.scope && !path.startsWith(rule.scope + '/')) continue;
      if (rule.ignored) {
        if (evidence) {
          if (evidence.ignoredGrants.length < 20)
            evidence.ignoredGrants.push({ grantId: rule.id, reason: rule.ignored });
          else evidence.truncated = true;
        }
      } else {
        allow ||= rule.effect === 'allow';
        deny ||= rule.effect === 'deny';
        if (evidence) {
          if (evidence.matchedGrantIds.length < 20) evidence.matchedGrantIds.push(rule.id);
          else evidence.truncated = true;
        }
      }
    }
    return {
      action,
      allowed: allow && !deny,
      reason: deny ? 'explicit_deny' : allow ? 'allow' : 'default_deny',
    };
  }
  return {
    allows: (action: Action, path: string) => evaluate(action, path).allowed,
    explain: (action: Action, path: string) => {
      const evidence: AccessEvidence = { matchedGrantIds: [], ignoredGrants: [], truncated: false };
      return { ...evaluate(action, path, evidence), evidence };
    },
  };
}
