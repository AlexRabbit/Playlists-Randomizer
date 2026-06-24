import type { PlaylistList } from '@/core/models/workspace';
import { addCard } from '@/app/store';
import { mountCard } from './card-player';

export function renderMain(el: HTMLElement, list: PlaylistList | null, editingCardId: string | null): void {
  el.innerHTML = '';

  const header = document.createElement('header');
  header.className = 'header';
  const h1 = document.createElement('h1');
  h1.textContent = list ? list.name : import.meta.env.VITE_APP_NAME || 'Playlists Randomizer';
  header.appendChild(h1);

  if (list) {
    const actions = document.createElement('div');
    actions.className = 'header-actions';
    const cardInput = document.createElement('input');
    cardInput.className = 'inline-input';
    cardInput.placeholder = 'New card name…';
    cardInput.style.maxWidth = '200px';
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn-primary';
    addBtn.textContent = '+ Card';
    addBtn.onclick = () => {
      addCard(list.id, cardInput.value.trim() || 'Untitled');
      cardInput.value = '';
    };
    cardInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addBtn.click();
    });
    actions.append(cardInput, addBtn);
    header.appendChild(actions);
  }

  el.appendChild(header);

  if (!list) {
    const empty = document.createElement('div');
    empty.className = 'empty-state glass';
    empty.innerHTML = `
      <p>Create a <strong>List</strong> on the right → then add <strong>Cards</strong> with YouTube playlists.</p>
      <p>Bookmark your URL to save everything.</p>
    `;
    el.appendChild(empty);
    return;
  }

  if (!list.cards.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state glass';
    empty.innerHTML = `<p>No cards yet. Add a card to start building your player.</p>`;
    el.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'cards-grid';
  for (const card of list.cards) {
    const cardEl = document.createElement('article');
    cardEl.className = 'card glass';
    cardEl.dataset.cardId = card.id;
    mountCard(cardEl, list.id, card, editingCardId === card.id);
    grid.appendChild(cardEl);
  }
  el.appendChild(grid);
}
