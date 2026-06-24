import { describe, it, expect } from 'vitest';
import { serializeBackup, parseBackup, BACKUP_MAGIC } from '@/core/import-export/backup';
import { createEmptyWorkspace, createList } from '@/core/models/workspace';

describe('backup import/export', () => {
  it('roundtrips workspace JSON', () => {
    const ws = createEmptyWorkspace();
    ws.lists.push(createList('MUSIC'));
    const json = serializeBackup(ws);
    const parsed = parseBackup(json);
    expect(parsed?.lists[0].name).toBe('MUSIC');
  });

  it('rejects wrong magic', () => {
    expect(parseBackup(JSON.stringify({ magic: 'WRONG', workspace: {} }))).toBeNull();
  });

  it('includes magic constant', () => {
    const ws = createEmptyWorkspace();
    const data = JSON.parse(serializeBackup(ws));
    expect(data.magic).toBe(BACKUP_MAGIC);
  });
});
