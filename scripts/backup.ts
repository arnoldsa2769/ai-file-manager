import Database from 'better-sqlite3';
import { existsSync, lstatSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export async function backupDatabase(source: string, destination: string): Promise<void> {
  const database = new Database(source, { readonly: true, fileMustExist: true });
  let created = false;
  try {
    const directory = dirname(destination);
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
    if ((lstatSync(directory).mode & 0o077) !== 0 || lstatSync(directory).isSymbolicLink())
      throw new Error('Backup directory must be private (mode 0700).');
    writeFileSync(destination, '', { flag: 'wx', mode: 0o600 });
    created = true;
    await database.backup(destination);
  } catch (error) {
    if (created) unlinkSync(destination);
    throw error;
  } finally {
    database.close();
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const destination = process.argv[2];
  if (!destination)
    throw new Error('Usage: npm run backup -- /private/backup-directory/workspace.db');
  await backupDatabase(
    resolve(process.env.AFM_DATA_DIR ?? 'data', 'workspace.db'),
    resolve(destination),
  );
  console.log(
    'Consistent private database backup created. Protect and encrypt it before transferring.',
  );
}
