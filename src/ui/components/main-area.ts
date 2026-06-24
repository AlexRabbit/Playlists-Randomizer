import type { PlaylistList, Workspace } from '@/core/models/workspace';
import { addCard, reorderCards } from '@/app/store';
import { mountCard } from './card-player';
import { openSearchPanel } from './search-panel';
import { fetchAllPlaylistVideos } from '@/core/youtube/playlist';
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
  header.className = 'header';
  const h1 = document.createElement('h1');
  h1.textContent = list ? list.name : t('appName');
  header.appendChild(h1);

  if (list) {
    const actions = document.createElement('div');
    actions.className = 'header-actions';

    const searchBtn = document.createElement('button');
    searchBtn.className = 'btn';
    searchBtn.textContent = '🔍 ' + t('search');
    searchBtn.onclick = async () => {
      const ids = list.cards.flatMap((c) => c.playlistIds);
      const videos = await fetchAllPlaylistVideos(ids, workspace.youtubeApiKey);
      openSearchPanel(videos, (v) => {
        document.dispatchEvent(
          new CustomEvent('prr:search-pick', { detail: { videoId: v.videoId } })
        );
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
    empty.innerHTML = `<p>${t('noListsHint')}</p>`;
    el.appendChild(empty);
    return;
  }

  if (!list.cards.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state glass';
    empty.innerHTML = `<p>${t('noCards')}</p>`;
    el.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'cards-grid';
  setupDragReorder(grid, list.cards, (from, to) => reorderCards(list.id, from, to), (card, _i, handle) => {
    const cardEl = document.createElement('article');
    cardEl.className = 'card glass';
    cardEl.dataset.cardId = card.id;
    mountCard(cardEl, list.id, card, editingCardId === card.id, workspace.youtubeApiKey, handle);
    return cardEl;
  });
  el.appendChild(grid);
}
