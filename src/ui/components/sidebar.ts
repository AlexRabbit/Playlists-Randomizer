import type { Workspace } from '@/core/models/workspace';
import {
  addList,
  setActiveList,
  deleteList,
  renameList,
  copyBookmark,
  exportData,
  importData,
  reorderLists,
  playAllInList,
  setYoutubeApiKey,
  registerBookmarkLink,
} from '@/app/store';
import { setupDragReorder } from './drag-reorder';
import { createBookmarkDragLink } from './bookmark-drag';
import { t } from '@/i18n';
import { bindHaptic } from '@/ui/haptics';

export function renderSidebar(el: HTMLElement, ws: Workspace): void {
  el.innerHTML = '';

  const title = document.createElement('h2');
  title.className = 'sidebar-title';
  title.textContent = t('lists');
  el.appendChild(title);

  const addRow = document.createElement('div');
  addRow.className = 'add-row';
  const input = document.createElement('input');
  input.className = 'inline-input';
  input.placeholder = t('newListPlaceholder');
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = '+';
  addBtn.title = t('addList');
  addBtn.onclick = () => {
    addList(input.value.trim() || 'Untitled');
    input.value = '';
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addBtn.click();
  });
  bindHaptic(addBtn);
  addRow.append(input, addBtn);
  el.appendChild(addRow);

  const nav = document.createElement('nav');
  nav.className = 'list-nav glass-scroll';
  setupDragReorder(nav, ws.lists, reorderLists, (list, _i, handle) => {
    const row = document.createElement('div');
    row.className = 'list-row';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'list-item' + (ws.activeListId === list.id ? ' active' : '');
    const label = document.createElement('span');
    label.textContent = list.name;
    btn.append(handle, label);

    btn.onclick = () => setActiveList(list.id);
    btn.oncontextmenu = (e) => {
      e.preventDefault();
      playAllInList(list.id);
    };
    btn.ondblclick = () => {
      const n = prompt(t('renameList'), list.name);
      if (n) renameList(list.id, n);
    };

    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'btn btn-icon';
    playBtn.textContent = '▶';
    playBtn.title = t('playAll');
    playBtn.onclick = (e) => {
      e.stopPropagation();
      playAllInList(list.id);
    };

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn-icon btn-danger';
    del.textContent = '×';
    del.title = t('deleteList');
    del.onclick = (e) => {
      e.stopPropagation();
      if (confirm(t('confirmDeleteList', { name: list.name }))) deleteList(list.id);
    };

    row.append(btn, playBtn, del);
    return row;
  });
  el.appendChild(nav);

  const settings = document.createElement('details');
  settings.className = 'settings-panel';
  const sum = document.createElement('summary');
  sum.textContent = t('settings');
  const apiLabel = document.createElement('label');
  apiLabel.textContent = t('youtubeApiKey');
  const apiHint = document.createElement('p');
  apiHint.className = 'modal-hint';
  apiHint.textContent = t('youtubeApiKeyHint');
  const apiInput = document.createElement('input');
  apiInput.className = 'inline-input';
  apiInput.type = 'password';
  apiInput.value = ws.youtubeApiKey ?? '';
  apiInput.placeholder = 'AIza…';
  const apiSave = document.createElement('button');
  apiSave.className = 'btn btn-primary';
  apiSave.textContent = t('apiKeySave');
  apiSave.onclick = () => setYoutubeApiKey(apiInput.value);
  apiLabel.append(apiInput);
  settings.append(sum, apiHint, apiLabel, apiSave);
  el.appendChild(settings);

  const footer = document.createElement('div');
  footer.className = 'sidebar-footer';

  const dragLink = createBookmarkDragLink(ws);
  registerBookmarkLink(dragLink);

  const bookmarkBtn = document.createElement('button');
  bookmarkBtn.className = 'btn';
  bookmarkBtn.textContent = t('copyBookmark');
  bookmarkBtn.onclick = () => copyBookmark();

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn';
  exportBtn.textContent = t('exportBackup');
  exportBtn.onclick = () => exportData();

  const importLabel = document.createElement('label');
  importLabel.className = 'btn';
  importLabel.style.cursor = 'pointer';
  importLabel.textContent = t('importBackup');
  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = '.json,application/json';
  importInput.style.display = 'none';
  importInput.onchange = () => {
    const f = importInput.files?.[0];
    if (f) importData(f);
    importInput.value = '';
  };
  importLabel.appendChild(importInput);

  footer.append(dragLink, bookmarkBtn, exportBtn, importLabel);
  el.appendChild(footer);
}
