import type { PlaylistList, Workspace } from '@/core/models/workspace';
import { defaultCardSettings } from '@/core/models/workspace';
import { addCard, reorderCards } from '@/app/store';
import { mountCard } from './card-player';
import { startGlobalSession } from './global-player';
import { openSearchPanel } from './search-panel';
import { fetchAllPlaylistVideos, orderVideos } from '@/core/youtube/playlist';
import { notifyPlaylistTruncation } from '@/core/youtube/truncation';
import { t } from '@/i18n';
import { setupDragReorder } from './drag-reorder';

export function renderMain(
  el: HTMLElement,
  list: PlaylistList | null,
  editingCardId: string | null,
  workspace: Workspace
): void {
  el.innerHTML = '';

  const header = document.createElement('header');
  header.className = 'header glass';
  const h1 = document.createElement('h1');
  h1.textContent = list ? list.name : t('appName');
  header.appendChild(h1);

  if (list) {
    const actions = document.createElement('div');
    actions.className = 'header-actions';
    actions.id = 'tour-list-actions';

    const searchBtn = document.createElement('button');
    searchBtn.className = 'btn';
    searchBtn.textContent = '🔍 ' + t('search');
    searchBtn.onclick = async () => {
      const ids = list.cards.flatMap((c) => c.playlistIds);
      const { videos: raw, truncated } = await fetchAllPlaylistVideos(ids, workspace.youtubeApiKey);
      notifyPlaylistTruncation(truncated);
      const videos = orderVideos(raw, false, Date.now());
      openSearchPanel(videos, (v) => {
        const idx = videos.findIndex((x) => x.videoId === v.videoId);
        startGlobalSession({
          listId: list.id,
          listName: list.name,
          videos,
          index: idx >= 0 ? idx : 0,
          settings: { ...defaultCardSettings(), random: false },
        });
      });
    };

    const cardInput = document.createElement('input');
    cardInput.className = 'inline-input';
    cardInput.placeholder = t('newCardPlaceholder');
    cardInput.style.maxWidth = '200px';
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary';
    addBtn.textContent = '+ ' + t('addCard');
    addBtn.onclick = () => {
      addCard(list.id, cardInput.value.trim() || 'Untitled');
      cardInput.value = '';
    };
    cardInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addBtn.click();
    });
    actions.append(searchBtn, cardInput, addBtn);
    header.appendChild(actions);
  }

  el.appendChild(header);

  if (!list) {
    const empty = document.createElement('div');
    empty.className = 'empty-state glass';
    empty.id = 'tour-no-cards';
    empty.innerHTML = `<p>${t('noListsHint')}</p>`;
    el.appendChild(empty);
    return;
  }

  if (!list.cards.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state glass';
    empty.id = 'tour-no-cards';
    empty.innerHTML = `<p>${t('noCards')}</p>`;
    el.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'cards-grid';
  grid.id = 'tour-cards-grid';
  setupDragReorder(grid, list.cards, (from, to) => reorderCards(list.id, from, to), (card, i, handle) => {
    const cardEl = document.createElement('article');
    cardEl.className = 'card glass';
    cardEl.dataset.cardId = card.id;
    mountCard(cardEl, list.id, card, editingCardId === card.id, workspace.youtubeApiKey, handle);
    if (i === 0) {
      cardEl.id = 'tour-first-card';
      cardEl.querySelector('.controls-row-main')?.setAttribute('id', 'tour-first-card-controls');
      cardEl.querySelector('.controls-row-toggles')?.setAttribute('id', 'tour-first-card-toggles');
      cardEl.querySelector('.card-menu')?.setAttribute('id', 'tour-first-card-menu');
      cardEl.querySelector(`button[aria-label="${t('queuePanel')}"]`)?.setAttribute('id', 'tour-queue-btn');
    }
    return cardEl;
  });
  el.appendChild(grid);
}
