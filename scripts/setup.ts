import { randomBytes } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export function initialize(directory: string): boolean {
  const config = join(directory, '.env');
  if (existsSync(config)) {
    const stat = lstatSync(config);
    if (stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
      throw new Error(
        'Existing .env must be a regular private file (mode 0600). It was not changed.',
      );
    return false;
  }
  const data = join(directory, 'data');
  mkdirSync(data, { recursive: true, mode: 0o700 });
  if ((lstatSync(data).mode & 0o077) !== 0 || lstatSync(data).isSymbolicLink())
    throw new Error('Use a private, non-symlink data directory (mode 0700).');
  writeFileSync(
    config,
    `AFM_ADMIN_TOKEN=${randomBytes(32).toString('hex')}\nAFM_DATA_DIR=./data\nAFM_PORT=7310\nAFM_DEV_ORIGIN=http://127.0.0.1:5173\n`,
    { flag: 'wx', mode: 0o600 },
  );
  return true;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(
    initialize(process.cwd())
      ? 'Created private .env and data directory. Read AFM_ADMIN_TOKEN from .env to sign in.'
      : 'Existing private .env preserved.',
  );
}
