import { copyBookmarkUrl } from '@/core/url-state/codec';
import type { Workspace } from '@/core/models/workspace';
import { t } from '@/i18n';

export function createBookmarkDragLink(ws: Workspace): HTMLAnchorElement {
  const a = document.createElement('a');
  a.className = 'btn bookmark-drag';
  a.href = copyBookmarkUrl(ws);
  a.textContent = t('dragBookmark');
  a.title = t('dragBookmark');
  a.draggable = true;
  a.addEventListener('dragstart', (e) => {
    e.dataTransfer?.setData('text/uri-list', a.href);
    e.dataTransfer?.setData('text/plain', a.href);
  });
  return a;
}

export function updateBookmarkDragLink(a: HTMLAnchorElement, ws: Workspace): void {
  a.href = copyBookmarkUrl(ws);
}
