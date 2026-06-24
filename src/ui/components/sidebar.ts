import type { Workspace } from '@/core/models/workspace';
import { addList, setActiveList, deleteList, renameList, copyBookmark, exportData, importData } from '@/app/store';

export function renderSidebar(el: HTMLElement, ws: Workspace): void {
  el.innerHTML = '';

  const title = document.createElement('h2');
  title.className = 'sidebar-title';
  title.textContent = 'Lists';
  el.appendChild(title);

  const addRow = document.createElement('div');
  addRow.style.display = 'flex';
  addRow.style.gap = '0.5rem';
  const input = document.createElement('input');
  input.className = 'inline-input';
  input.placeholder = 'New list name…';
  input.setAttribute('aria-label', 'New list name');
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = '+';
  addBtn.title = 'Add list';
  addBtn.onclick = () => {
    const name = input.value.trim() || 'Untitled';
    addList(name);
    input.value = '';
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addBtn.click();
  });
  addRow.append(input, addBtn);
  el.appendChild(addRow);

  const nav = document.createElement('nav');
  nav.className = 'list-nav';
  nav.setAttribute('aria-label', 'Playlist lists');

  for (const list of ws.lists) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'list-item' + (ws.activeListId === list.id ? ' active' : '');
    const label = document.createElement('span');
    label.textContent = list.name;
    btn.appendChild(label);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'btn btn-icon btn-danger';
    del.innerHTML = '×';
    del.title = 'Delete list';
    del.onclick = (e) => {
      e.stopPropagation();
      if (confirm(`Delete list "${list.name}"?`)) deleteList(list.id);
    };

    btn.onclick = () => setActiveList(list.id);
    btn.ondblclick = () => {
      const n = prompt('Rename list', list.name);
      if (n) renameList(list.id, n);
    };

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '0.35rem';
    row.style.alignItems = 'center';
    row.append(btn, del);
    nav.appendChild(row);
  }

  el.appendChild(nav);

  const footer = document.createElement('div');
  footer.style.marginTop = 'auto';
  footer.style.display = 'flex';
  footer.style.flexDirection = 'column';
  footer.style.gap = '0.5rem';
  footer.style.paddingTop = '1rem';
  footer.style.borderTop = '1px solid var(--glass-border)';

  const bookmarkHint = document.createElement('p');
  bookmarkHint.className = 'bookmark-hint';
  bookmarkHint.textContent = ws.lists.length
    ? '★ Your lists, cards, playlists & settings live in this page URL — bookmark it to restore everything.'
    : '★ Build your workspace, then bookmark this page — the URL saves everything.';
  footer.appendChild(bookmarkHint);

  const bookmarkBtn = document.createElement('button');
  bookmarkBtn.className = 'btn';
  bookmarkBtn.textContent = '🔗 Copy bookmark';
  bookmarkBtn.onclick = () => copyBookmark();

  const exportBtn = document.createElement('button');
  exportBtn.className = 'btn';
  exportBtn.textContent = '⬇ Export backup';
  exportBtn.onclick = () => exportData();

  const importLabel = document.createElement('label');
  importLabel.className = 'btn';
  importLabel.style.cursor = 'pointer';
  importLabel.textContent = '⬆ Import backup';
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

  footer.append(bookmarkBtn, exportBtn, importLabel);
  el.appendChild(footer);
}
