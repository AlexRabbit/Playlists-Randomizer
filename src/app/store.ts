import type { Workspace, PlaylistList, Card } from '@/core/models/workspace';
import { createList, createCard } from '@/core/models/workspace';
import { writeWorkspaceToUrl, copyBookmarkUrl } from '@/core/url-state/codec';
import { downloadBackup, parseBackup } from '@/core/import-export/backup';
import { log } from '@/logs/logger';
import { renderSidebar } from '@/ui/components/sidebar';
import { renderMain } from '@/ui/components/main-area';
import { renderLogPanel } from '@/ui/components/log-panel';

export type AppState = {
  workspace: Workspace;
  editingCardId: string | null;
};

let state: AppState;
let root: HTMLElement;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function getState(): AppState {
  return state;
}

export function initApp(el: HTMLElement, initial: Workspace): void {
  root = el;
  state = { workspace: initial, editingCardId: null };
  // Canonical URL in address bar so browser bookmark saves full workspace
  if (initial.lists.length) {
    writeWorkspaceToUrl(initial);
  }
  render();
  window.addEventListener('popstate', () => {
    log.info('app', 'popstate — reload from URL');
    location.reload();
  });
}

function persist(): void {
  writeWorkspaceToUrl(state.workspace);
}

function showToast(msg: string): void {
  const existing = document.querySelector('.toast');
  existing?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2800);
}

export function setActiveList(id: string): void {
  state.workspace.activeListId = id;
  state.editingCardId = null;
  persist();
  render();
}

export function addList(name: string): void {
  const list = createList(name);
  state.workspace.lists.push(list);
  state.workspace.activeListId = list.id;
  log.info('app', 'List created', { name: list.name });
  persist();
  render();
}

export function deleteList(id: string): void {
  state.workspace.lists = state.workspace.lists.filter((l) => l.id !== id);
  if (state.workspace.activeListId === id) {
    state.workspace.activeListId = state.workspace.lists[0]?.id ?? null;
  }
  persist();
  render();
}

export function renameList(id: string, name: string): void {
  const list = state.workspace.lists.find((l) => l.id === id);
  if (list) list.name = name.trim() || list.name;
  persist();
  render();
}

export function addCard(listId: string, name: string): void {
  const list = state.workspace.lists.find((l) => l.id === listId);
  if (!list) return;
  const card = createCard(name);
  list.cards.push(card);
  state.editingCardId = card.id;
  log.info('app', 'Card created', { name: card.name });
  persist();
  render();
}

export function deleteCard(listId: string, cardId: string): void {
  const list = state.workspace.lists.find((l) => l.id === listId);
  if (!list) return;
  list.cards = list.cards.filter((c) => c.id !== cardId);
  if (state.editingCardId === cardId) state.editingCardId = null;
  persist();
  render();
}

export function updateCard(listId: string, cardId: string, patch: Partial<Card>): void {
  const list = state.workspace.lists.find((l) => l.id === listId);
  const card = list?.cards.find((c) => c.id === cardId);
  if (!card) return;
  Object.assign(card, patch);
  persist();
}

export function setEditingCard(id: string | null): void {
  state.editingCardId = id;
  render();
}

import { parsePlaylistIdsFromText } from '@/core/youtube/playlist';

export function saveCardPlaylists(listId: string, cardId: string, text: string): void {
  const ids = parsePlaylistIdsFromText(text);
  updateCard(listId, cardId, { playlistIds: ids });
  state.editingCardId = null;
  showToast(ids.length ? `Saved ${ids.length} playlist(s)` : 'No valid playlists found');
  render();
}

export function copyBookmark(): void {
  const url = copyBookmarkUrl(state.workspace);
  navigator.clipboard.writeText(url).then(() => showToast('Bookmark URL copied!'));
}

export function exportData(): void {
  downloadBackup(state.workspace);
  showToast('Backup downloaded');
}

export function importData(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    const ws = parseBackup(String(reader.result));
    if (!ws) {
      showToast('Invalid backup file');
      return;
    }
    state.workspace = ws;
    state.editingCardId = null;
    persist();
    render();
    showToast('Workspace imported');
  };
  reader.readAsText(file);
}

function getActiveList(): PlaylistList | null {
  const id = state.workspace.activeListId;
  return state.workspace.lists.find((l) => l.id === id) ?? state.workspace.lists[0] ?? null;
}

function render(): void {
  const active = getActiveList();
  if (active && !state.workspace.activeListId) {
    state.workspace.activeListId = active.id;
  }

  root.innerHTML = '';
  const shell = document.createElement('div');
  shell.className = 'app-shell';

  const main = document.createElement('main');
  main.className = 'main';
  renderMain(main, active, state.editingCardId);
  shell.appendChild(main);

  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar glass';
  renderSidebar(sidebar, state.workspace);
  shell.appendChild(sidebar);

  root.appendChild(shell);

  const existingLog = document.getElementById('log-panel-root');
  if (!existingLog) {
    const logRoot = document.createElement('div');
    logRoot.id = 'log-panel-root';
    document.body.appendChild(logRoot);
    renderLogPanel(logRoot);
  }
}

export function rerenderCard(cardId: string): void {
  const el = document.querySelector(`[data-card-id="${cardId}"]`);
  if (el) {
    render();
  }
}
