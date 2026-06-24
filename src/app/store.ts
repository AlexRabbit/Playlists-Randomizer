import type { Workspace, PlaylistList, Card } from '@/core/models/workspace';
import { createList, createCard, defaultCardSettings } from '@/core/models/workspace';
import { writeWorkspaceToUrl, copyBookmarkUrl, readWorkspaceFromUrl } from '@/core/url-state/codec';
import { downloadBackup, parseBackup } from '@/core/import-export/backup';
import { fetchAllPlaylistVideos, orderVideos, parsePlaylistIdsFromText } from '@/core/youtube/playlist';
import { log } from '@/logs/logger';
import { renderSidebar } from '@/ui/components/sidebar';
import { renderMain } from '@/ui/components/main-area';
import { renderLogPanel, toggleLogPanel } from '@/ui/components/log-panel';
import {
  setGlobalPlayerMount,
  startGlobalSession,
  getGlobalSession,
  globalTogglePlay,
  globalPrev,
  globalNext,
  closeGlobalPlayer,
} from '@/ui/components/global-player';
import { t } from '@/i18n';

export type AppState = {
  workspace: Workspace;
  editingCardId: string | null;
  focusedCardId: string | null;
};

let state: AppState;
let root: HTMLElement;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let bookmarkLinkEl: HTMLAnchorElement | null = null;

export function getState(): AppState {
  return state;
}

export function getWorkspace(): Workspace {
  return state.workspace;
}

export function initApp(el: HTMLElement, initial: Workspace): void {
  root = el;
  state = { workspace: initial, editingCardId: null, focusedCardId: null };
  if (initial.lists.length) writeWorkspaceToUrl(initial);
  mountChrome();
  setupKeyboard();
  window.addEventListener('popstate', () => location.reload());
}

function mountChrome(): void {
  render();
  let globalRoot = document.getElementById('global-player-root');
  if (!globalRoot) {
    globalRoot = document.createElement('div');
    globalRoot.id = 'global-player-root';
    document.body.appendChild(globalRoot);
    setGlobalPlayerMount(globalRoot, () => persist());
  }
  let logRoot = document.getElementById('log-panel-root');
  if (!logRoot) {
    logRoot = document.createElement('div');
    logRoot.id = 'log-panel-root';
    document.body.appendChild(logRoot);
    renderLogPanel(logRoot);
  }
}

function persist(): void {
  writeWorkspaceToUrl(state.workspace);
  if (bookmarkLinkEl) bookmarkLinkEl.href = copyBookmarkUrl(state.workspace);
}

function showToast(msg: string): void {
  document.querySelector('.toast')?.remove();
  const t_el = document.createElement('div');
  t_el.className = 'toast';
  t_el.textContent = msg;
  document.body.appendChild(t_el);
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t_el.remove(), 2800);
}

function setupKeyboard(): void {
  document.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable) return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (getGlobalSession()) globalTogglePlay();
      else document.dispatchEvent(new CustomEvent('prr:card-play-toggle'));
    } else if (e.code === 'ArrowLeft') {
      if (getGlobalSession()) globalPrev();
      else document.dispatchEvent(new CustomEvent('prr:card-prev'));
    } else if (e.code === 'ArrowRight') {
      if (getGlobalSession()) globalNext();
      else document.dispatchEvent(new CustomEvent('prr:card-next'));
    }
  });
}

export function setFocusedCard(cardId: string | null): void {
  state.focusedCardId = cardId;
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
  persist();
  render();
}

export function deleteList(id: string): void {
  state.workspace.lists = state.workspace.lists.filter((l) => l.id !== id);
  if (state.workspace.activeListId === id) {
    state.workspace.activeListId = state.workspace.lists[0]?.id ?? null;
  }
  if (getGlobalSession()?.listId === id) closeGlobalPlayer();
  persist();
  render();
}

export function renameList(id: string, name: string): void {
  const list = state.workspace.lists.find((l) => l.id === id);
  if (list) list.name = name.trim() || list.name;
  persist();
  render();
}

export function reorderLists(from: number, to: number): void {
  const { lists } = state.workspace;
  if (from < 0 || to < 0 || from >= lists.length || to >= lists.length) return;
  const [item] = lists.splice(from, 1);
  lists.splice(to, 0, item);
  persist();
  render();
}

export function reorderCards(listId: string, from: number, to: number): void {
  const list = state.workspace.lists.find((l) => l.id === listId);
  if (!list) return;
  if (from < 0 || to < 0 || from >= list.cards.length || to >= list.cards.length) return;
  const [item] = list.cards.splice(from, 1);
  list.cards.splice(to, 0, item);
  persist();
  render();
}

export function addCard(listId: string, name: string): void {
  const list = state.workspace.lists.find((l) => l.id === listId);
  if (!list) return;
  const card = createCard(name);
  list.cards.push(card);
  state.editingCardId = card.id;
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

export function saveCardPlaylists(listId: string, cardId: string, text: string): void {
  const ids = parsePlaylistIdsFromText(text);
  updateCard(listId, cardId, { playlistIds: ids });
  state.editingCardId = null;
  showToast(ids.length ? t('savedPlaylists', { count: ids.length }) : t('noValidPlaylists'));
  render();
}

export function setYoutubeApiKey(key: string): void {
  state.workspace.youtubeApiKey = key.trim() || undefined;
  persist();
  showToast(t('apiKeySave'));
}

export async function playAllInList(listId: string): Promise<void> {
  const list = state.workspace.lists.find((l) => l.id === listId);
  if (!list) return;
  const ids = list.cards.flatMap((c) => c.playlistIds);
  if (!ids.length) {
    showToast(t('noValidPlaylists'));
    return;
  }
  showToast(t('playAllLoading'));
  const raw = await fetchAllPlaylistVideos(ids, state.workspace.youtubeApiKey);
  const videos = orderVideos(raw, true, Date.now());
  const settings = { ...defaultCardSettings(), random: true };
  startGlobalSession({
    listId,
    listName: list.name,
    videos,
    index: 0,
    settings,
  });
  persist();
}

export function copyBookmark(): void {
  navigator.clipboard.writeText(copyBookmarkUrl(state.workspace)).then(() => showToast(t('bookmarkCopied')));
}

export function exportData(): void {
  downloadBackup(state.workspace);
  showToast(t('backupDownloaded'));
}

export function importData(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    const ws = parseBackup(String(reader.result));
    if (!ws) {
      showToast(t('invalidBackup'));
      return;
    }
    state.workspace = ws;
    state.editingCardId = null;
    persist();
    render();
    showToast(t('workspaceImported'));
  };
  reader.readAsText(file);
}

export function registerBookmarkLink(el: HTMLAnchorElement): void {
  bookmarkLinkEl = el;
  el.href = copyBookmarkUrl(state.workspace);
}

function getActiveList(): PlaylistList | null {
  const id = state.workspace.activeListId;
  return state.workspace.lists.find((l) => l.id === id) ?? state.workspace.lists[0] ?? null;
}

function render(): void {
  const active = getActiveList();
  if (active && !state.workspace.activeListId) state.workspace.activeListId = active.id;

  root.innerHTML = '';

  const topBar = document.createElement('header');
  topBar.className = 'app-topbar';
  const topTitle = document.createElement('span');
  topTitle.className = 'app-topbar-title';
  topTitle.textContent = t('appName');
  const logsBtn = document.createElement('button');
  logsBtn.type = 'button';
  logsBtn.className = 'btn';
  logsBtn.textContent = '🔬 ' + t('logs');
  logsBtn.onclick = () => toggleLogPanel();
  topBar.append(topTitle, logsBtn);
  root.appendChild(topBar);

  const shell = document.createElement('div');
  shell.className = 'app-shell';

  const main = document.createElement('main');
  main.className = 'main';
  renderMain(main, active, state.editingCardId, state.workspace);
  shell.appendChild(main);

  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar glass';
  renderSidebar(sidebar, state.workspace);
  shell.appendChild(sidebar);

  root.appendChild(shell);
}

/** Reload workspace from current URL (after external navigation) */
export function reloadFromUrl(): void {
  state.workspace = readWorkspaceFromUrl();
  state.editingCardId = null;
  render();
}
