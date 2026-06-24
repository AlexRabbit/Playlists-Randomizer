import type { Workspace } from '../models/workspace';
import { WORKSPACE_VERSION } from '../models/workspace';
import { log } from '@/logs/logger';

export const BACKUP_MAGIC = 'PRR_BACKUP';
export const BACKUP_VERSION = 1;

export interface BackupFile {
  magic: typeof BACKUP_MAGIC;
  version: number;
  exportedAt: string;
  workspace: Workspace;
}

export function exportWorkspace(ws: Workspace): BackupFile {
  return {
    magic: BACKUP_MAGIC,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    workspace: { ...ws, version: WORKSPACE_VERSION },
  };
}

export function serializeBackup(ws: Workspace): string {
  return JSON.stringify(exportWorkspace(ws), null, 2);
}

export function parseBackup(json: string): Workspace | null {
  try {
    const data = JSON.parse(json) as BackupFile;
    if (data.magic !== BACKUP_MAGIC) {
      log.warn('import', 'Unknown backup magic', { magic: (data as { magic?: string }).magic });
      return null;
    }
    if (!data.workspace?.lists) return null;
    log.info('import', 'Backup parsed', { version: data.version, lists: data.workspace.lists.length });
    return {
      version: data.workspace.version ?? WORKSPACE_VERSION,
      lists: data.workspace.lists,
      activeListId: data.workspace.activeListId ?? null,
    };
  } catch (e) {
    log.error('import', 'Backup parse failed', { error: String(e) });
    return null;
  }
}

export function downloadBackup(ws: Workspace, filename?: string): void {
  const blob = new Blob([serializeBackup(ws)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename ?? `playlists-randomizer-backup-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  log.info('export', 'Backup downloaded');
}
