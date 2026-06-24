import type { Card } from '@/core/models/workspace';
import {
  deleteCard,
  setEditingCard,
  saveCardPlaylists,
  updateCard,
  setFocusedCard,
  getState,
} from '@/app/store';
import { fetchAllPlaylistVideos, orderVideos } from '@/core/youtube/playlist';
import { YouTubePlayerController } from '@/core/youtube/player';
import type { VideoEntry } from '@/core/models/workspace';
import { log } from '@/logs/logger';
import { createSeekBar, formatTime } from './seek-bar';
import { openSearchPanel, renderThumbnailGrid } from './search-panel';
import { t } from '@/i18n';
import { bindHaptic } from '@/ui/haptics';

const controllers = new Map<string, YouTubePlayerController>();

export function mountCard(
  el: HTMLElement,
  listId: string,
  card: Card,
  editing: boolean,
  apiKey: string | undefined,
  dragHandle?: HTMLElement
): void {
  el.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'card-header';
  if (dragHandle) header.prepend(dragHandle);
  const title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = card.name;
  header.appendChild(title);

  const headerActions = document.createElement('div');
  headerActions.className = 'card-header-actions';

  if (!editing && card.playlistIds.length) {
    const editBtn = iconBtn('✎', t('editPlaylists'));
    editBtn.onclick = () => setEditingCard(card.id);
    headerActions.appendChild(editBtn);
  }

  headerActions.appendChild(createCardMenu(listId, card));
  header.appendChild(headerActions);
  el.appendChild(header);

  if (editing || !card.playlistIds.length) {
    renderEditor(el, listId, card);
    return;
  }

  renderPlayer(el, listId, card, apiKey);
}

function createCardMenu(listId: string, card: Card): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'card-menu';

  const trigger = iconBtn('⋮', t('moreActions'));
  const menu = document.createElement('div');
  menu.className = 'card-menu-dropdown';
  menu.hidden = true;

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'card-menu-item card-menu-danger';
  deleteBtn.textContent = t('deleteCard');
  deleteBtn.onclick = () => {
    menu.hidden = true;
    if (confirm(t('confirmDeleteCard', { name: card.name }))) {
      controllers.get(card.id)?.destroy();
      controllers.delete(card.id);
      deleteCard(listId, card.id);
    }
  };

  menu.appendChild(deleteBtn);
  wrap.append(trigger, menu);

  trigger.onclick = (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  };

  const closeMenu = () => {
    menu.hidden = true;
  };
  document.addEventListener('click', closeMenu);
  menu.onclick = (e) => e.stopPropagation();

  return wrap;
}

function renderEditor(el: HTMLElement, listId: string, card: Card): void {
  const form = document.createElement('div');
  form.className = 'card-edit';

  const nameLabel = document.createElement('label');
  nameLabel.textContent = t('cardName');
  const nameInput = document.createElement('input');
  nameInput.value = card.name;
  nameLabel.appendChild(nameInput);

  const plLabel = document.createElement('label');
  plLabel.textContent = t('playlistUrls');
  const plText = document.createElement('textarea');
  plText.placeholder = 'https://www.youtube.com/playlist?list=PL...';
  plText.value = card.playlistIds.join('\n');
  plLabel.appendChild(plText);

  const actions = document.createElement('div');
  actions.className = 'modal-actions';
  const save = document.createElement('button');
  save.className = 'btn btn-primary';
  save.textContent = t('saveAndPlay');
  save.onclick = () => {
    updateCard(listId, card.id, { name: nameInput.value.trim() || card.name });
    saveCardPlaylists(listId, card.id, plText.value);
  };
  const cancel = document.createElement('button');
  cancel.className = 'btn';
  cancel.textContent = t('cancel');
  cancel.onclick = () => setEditingCard(null);
  actions.append(save, cancel);
  form.append(nameLabel, plLabel, actions);
  el.appendChild(form);
}

function renderPlayer(
  el: HTMLElement,
  listId: string,
  card: Card,
  apiKey: string | undefined
): void {
  const nowPlaying = document.createElement('div');
  nowPlaying.className = 'now-playing';
  nowPlaying.textContent = t('loadingPlaylists');

  const playerWrap = document.createElement('div');
  playerWrap.className = 'player-area' + (card.settings.showVideo ? '' : ' audio-only');
  const playerHost = document.createElement('div');
  playerHost.id = `yt-${card.id}`;
  playerHost.className = 'player-host';
  playerWrap.appendChild(playerHost);

  const thumbGrid = document.createElement('div');
  thumbGrid.className = 'thumb-grid-wrap';

  const seek = createSeekBar((frac) => {
    if (duration > 0) ctrl.seek(frac * duration);
  }, () => t('seek'));
  const timeRow = document.createElement('div');
  timeRow.className = 'seek-times';
  const curEl = document.createElement('span');
  const durEl = document.createElement('span');
  timeRow.append(curEl, durEl);
  const baseSeek = seek.update;
  seek.update = (c, d) => {
    duration = d;
    baseSeek(c, d);
    curEl.textContent = formatTime(c);
    durEl.textContent = formatTime(d);
  };

  const controls = document.createElement('div');
  controls.className = 'controls';

  const prev = iconBtn('⏮', t('previous'));
  const play = iconBtn('▶', t('playPause'));
  const next = iconBtn('⏭', t('next'));
  const randomBtn = iconBtn('🔀', t('random'));
  randomBtn.classList.toggle('active', card.settings.random);
  const videoBtn = iconBtn('📺', t('showVideo'));
  videoBtn.classList.toggle('active', card.settings.showVideo);
  const adsBtn = iconBtn('🚫', t('noAds'));
  adsBtn.classList.toggle('active', card.settings.noAds);
  const autoBtn = iconBtn('⏭️', t('autoplayNext'));
  autoBtn.classList.toggle('active', card.settings.autoplayNext);
  const searchBtn = iconBtn('🔍', t('search'));

  controls.append(prev, play, next);
  const spacer = document.createElement('span');
  spacer.className = 'spacer';
  controls.append(spacer, randomBtn, videoBtn, adsBtn, autoBtn, searchBtn);
  el.append(nowPlaying, playerWrap, thumbGrid, seek.el, timeRow, controls);

  let videos: VideoEntry[] = [];
  let index = card.currentVideoIndex ?? 0;
  let playing = false;
  let duration = 0;

  const ctrl = new YouTubePlayerController(
    playerHost,
    card.settings,
    () => {
      if (card.settings.autoplayNext) go(1);
      else {
        playing = false;
        play.textContent = '▶';
      }
    },
    (c, d) => seek.update(c, d)
  );
  controllers.set(card.id, ctrl);

  function go(deltaOrIndex: number, absolute = false): void {
    if (!videos.length) return;
    if (absolute) index = deltaOrIndex;
    else index = (index + deltaOrIndex + videos.length) % videos.length;
    updateCard(listId, card.id, { currentVideoIndex: index });
    const v = videos[index];
    if (!playing) {
      void ctrl.init(v.videoId).then(() => {
        playing = true;
        play.textContent = '⏸';
      });
    } else {
      ctrl.play(v.videoId);
    }
    play.textContent = '⏸';
    playing = true;
    updateNowPlaying();
    if (card.settings.showVideo) renderThumbnailGrid(thumbGrid, videos, index, (i) => go(i, true));
  }

  function updateNowPlaying(): void {
    const v = videos[index];
    if (!v) {
      nowPlaying.innerHTML = `<strong>${t('noVideos')}</strong>${t('noVideosHint')}`;
      return;
    }
    nowPlaying.innerHTML = `<strong>${esc(v.title)}</strong>${index + 1} / ${videos.length}`;
  }

  play.onclick = () => {
    setFocusedCard(card.id);
    if (!videos.length) return;
    if (!playing) {
      const v = videos[index];
      void ctrl.init(v.videoId).then(() => {
        playing = true;
        play.textContent = '⏸';
      });
    } else if (ctrl.isPlaying()) {
      ctrl.pause();
      playing = false;
      play.textContent = '▶';
    } else {
      ctrl.resume();
      playing = true;
      play.textContent = '⏸';
    }
  };
  prev.onclick = () => go(-1);
  next.onclick = () => go(1);

  randomBtn.onclick = () => {
    const random = !card.settings.random;
    updateCard(listId, card.id, {
      settings: { ...card.settings, random },
      shuffleSeed: Date.now(),
      currentVideoIndex: 0,
    });
    card.settings.random = random;
    randomBtn.classList.toggle('active', random);
    reloadVideos();
  };

  videoBtn.onclick = () => {
    const showVideo = !card.settings.showVideo;
    updateCard(listId, card.id, { settings: { ...card.settings, showVideo } });
    card.settings.showVideo = showVideo;
    videoBtn.classList.toggle('active', showVideo);
    playerWrap.classList.toggle('audio-only', !showVideo);
    thumbGrid.style.display = showVideo ? '' : 'none';
    ctrl.updateSettings(card.settings);
    if (showVideo) renderThumbnailGrid(thumbGrid, videos, index, (i) => go(i, true));
  };

  const focused = () => getState().focusedCardId === card.id;

  adsBtn.onclick = () => {
    const noAds = !card.settings.noAds;
    updateCard(listId, card.id, { settings: { ...card.settings, noAds } });
    card.settings.noAds = noAds;
    adsBtn.classList.toggle('active', noAds);
    ctrl.updateSettings(card.settings);
  };

  autoBtn.onclick = () => {
    const autoplayNext = !card.settings.autoplayNext;
    updateCard(listId, card.id, { settings: { ...card.settings, autoplayNext } });
    card.settings.autoplayNext = autoplayNext;
    autoBtn.classList.toggle('active', autoplayNext);
  };

  searchBtn.onclick = () => {
    if (!videos.length) return;
    openSearchPanel(videos, (_, idx) => go(idx, true));
  };

  const onToggle = () => {
    if (focused()) play.click();
  };
  const onPrev = () => focused() && go(-1);
  const onNext = () => focused() && go(1);
  const onSearch = (e: Event) => {
    const vid = (e as CustomEvent).detail?.videoId;
    const i = videos.findIndex((x) => x.videoId === vid);
    if (i >= 0 && focused()) go(i, true);
  };

  document.addEventListener('prr:card-play-toggle', onToggle);
  document.addEventListener('prr:card-prev', onPrev);
  document.addEventListener('prr:card-next', onNext);
  document.addEventListener('prr:search-pick', onSearch);

  async function reloadVideos(): Promise<void> {
    nowPlaying.textContent = t('loadingPlaylists');
    try {
      const raw = await fetchAllPlaylistVideos(card.playlistIds, apiKey);
      const seed = card.shuffleSeed ?? Date.now();
      videos = orderVideos(raw, card.settings.random, seed);
      if (!card.shuffleSeed) updateCard(listId, card.id, { shuffleSeed: seed });
      index = Math.min(card.currentVideoIndex ?? 0, Math.max(0, videos.length - 1));
      updateNowPlaying();
      if (card.settings.showVideo) {
        thumbGrid.style.display = '';
        renderThumbnailGrid(thumbGrid, videos, index, (i) => go(i, true));
      } else {
        thumbGrid.style.display = 'none';
      }
      log.info('player', 'Card ready', { card: card.name, videos: videos.length });
    } catch (e) {
      nowPlaying.innerHTML = `<strong>${t('noVideos')}</strong>${t('fetchErrorHint')}`;
      log.error('player', 'Load failed', { error: String(e) });
    }
  }

  setFocusedCard(card.id);
  reloadVideos();
}

function iconBtn(icon: string, label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn btn-icon';
  b.textContent = icon;
  b.title = label;
  b.setAttribute('aria-label', label);
  bindHaptic(b);
  return b;
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
