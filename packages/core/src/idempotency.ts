import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { DomainError, type Principal } from './types.js';

export function validateIdempotencyKey(key: unknown): asserts key is string {
  if (typeof key !== 'string' || !/^[A-Za-z0-9._:-]{1,128}$/.test(key))
    throw new DomainError(
      'INVALID_INPUT',
      'Idempotency keys must contain 1-128 ASCII letters, digits, periods, underscores, colons, or hyphens.',
    );
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, stable(v)]),
    );
  return value;
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

/** The caller checks current authority before entering this transaction, including replays. */
export function idempotent<T>(
  db: Database.Database,
  principal: Principal,
  workspaceId: string,
  key: string | undefined,
  operation: string,
  input: unknown,
  execute: () => T,
): T {
  if (key === undefined) return execute();
  validateIdempotencyKey(key);
  const keyHash = hash(key);
  const fingerprint = hash(JSON.stringify(stable({ operation, input })));
  return db
    .transaction(() => {
      const receipt = db
        .prepare(
          'SELECT fingerprint, response FROM idempotency WHERE workspaceId=? AND principalId=? AND keyHash=?',
        )
        .get(workspaceId, principal.id, keyHash) as
        { fingerprint: string; response: string } | undefined;
      if (receipt) {
        if (receipt.fingerprint !== fingerprint)
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'This idempotency key is reserved for a different request.',
            409,
          );
        return JSON.parse(receipt.response) as T;
      }
      const result = execute();
      db.prepare(
        'INSERT INTO idempotency (workspaceId,principalId,keyHash,fingerprint,response,createdAt) VALUES (?,?,?,?,?,?)',
      ).run(
        workspaceId,
        principal.id,
        keyHash,
        fingerprint,
        JSON.stringify(result),
        new Date().toISOString(),
      );
      return result;
    })
    .immediate();
}
