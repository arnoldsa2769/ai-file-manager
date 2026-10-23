import { DomainError, type Action, type Grant } from './types.js';
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
  canonicalPath(path);
  const matching = grants.filter(
    (g) =>
      !g.revokedAt &&
      (!g.expiresAt || Date.parse(g.expiresAt) > now.getTime()) &&
      g.actions.includes(action) &&
      (g.scope === '/' || path === g.scope || path.startsWith(g.scope + '/')),
  );
  return matching.some((g) => g.effect === 'allow') && !matching.some((g) => g.effect === 'deny');
}
