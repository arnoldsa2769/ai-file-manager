import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceService } from '../packages/core/src/service.js';
import { operator } from '../packages/core/src/types.js';
import { backupDatabase } from '../scripts/backup.js';
test('online backup preserves committed revisions and refuses to overwrite a backup', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'afm-backup-'));
  const source = join(dir, 'source.db');
  const destination = join(dir, 'backup.db');
  const service = new WorkspaceService(source);
  try {
    const workspace = service.createWorkspace(operator, 'Backup test');
    const proposal = service.propose(operator, workspace.id, {
      title: 'Saved revision',
      operations: [{ path: '/a.md', baseRevision: null, content: 'Preserved document' }],
    });
    service.approve(operator, workspace.id, proposal.id);
    service.apply(operator, workspace.id, proposal.id);
    await backupDatabase(source, destination);
    const restored = new WorkspaceService(destination);
    try {
      assert.equal(
        restored.readDocument(operator, workspace.id, '/a.md').content,
        'Preserved document',
      );
      assert.equal(restored.history(operator, workspace.id, '/a.md').length, 1);
    } finally {
      restored.close();
    }
    assert.equal(statSync(destination).mode & 0o777, 0o600);
    await assert.rejects(backupDatabase(source, destination), /exist/i);
  } finally {
    service.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
