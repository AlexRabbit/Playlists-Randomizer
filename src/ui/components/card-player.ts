import type { Card } from '@/core/models/workspace';
import {
  deleteCard,
  setEditingCard,
  saveCardPlaylists,
  updateCard,
  setFocusedCard,
  getState,
} from '@/app/store';
import {
  fetchAllPlaylistVideos,
  orderVideos,
  refreshPlaylistVideos,
  mergeVideoLists,
} from '@/core/youtube/playlist';
import { notifyPlaylistTruncation } from '@/core/youtube/truncation';
import { YouTubePlayerController } from '@/core/youtube/player';
import type { VideoEntry } from '@/core/models/workspace';
import { log } from '@/logs/logger';
import { createSeekBar, formatTime } from './seek-bar';
import { openSearchPanel } from './search-panel';
import {
  showPlaylistSidebar,
  hidePlaylistSidebar,
  updatePlaylistSidebar,
  type PlaylistSidebarConfig,
} from './playlist-sidebar';
import { createSkeletonCard } from './skeleton';
import { iconButton, icons, setIcon } from '@/ui/icons';
import { t } from '@/i18n';
import { bindHaptic } from '@/ui/haptics';
import { showToast } from '@/app/toast';
import type { PlaylistTruncation } from '@/core/youtube/playlist';

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
    const editBtn = iconButton('edit', t('editPlaylists'));
    bindHaptic(editBtn);
    editBtn.onclick = () => setEditingCard(card.id);
    headerActions.appendChild(editBtn);
  }

  const { wrap: menu, loadFullItem } = createCardMenu(listId, card);
  headerActions.appendChild(menu);
  header.appendChild(headerActions);
  el.appendChild(header);

  if (editing || !card.playlistIds.length) {
    renderEditor(el, listId, card);
    return;
  }

  renderPlayer(el, listId, card, apiKey, loadFullItem);
}

function createCardMenu(
  listId: string,
  card: Card
): { wrap: HTMLElement; loadFullItem: HTMLButtonElement } {
  const wrap = document.createElement('div');
  wrap.className = 'card-menu';

  const trigger = iconButton('more', t('moreActions'));
  const menu = document.createElement('div');
  menu.className = 'card-menu-dropdown glass-elevated';
  menu.hidden = true;

  const adsBtn = document.createElement('button');
  adsBtn.type = 'button';
  adsBtn.className = 'card-menu-item' + (card.settings.noAds ? ' active' : '');
  adsBtn.textContent = (card.settings.noAds ? '✓ ' : '') + t('noAdsToggle');
  adsBtn.onclick = () => {
    menu.hidden = true;
    const noAds = !card.settings.noAds;
    updateCard(listId, card.id, { settings: { ...card.settings, noAds } });
    card.settings.noAds = noAds;
    adsBtn.classList.toggle('active', noAds);
    adsBtn.textContent = (noAds ? '✓ ' : '') + t('noAdsToggle');
    controllers.get(card.id)?.updateSettings(card.settings);
  };

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

  const loadFullItem = document.createElement('button');
  loadFullItem.type = 'button';
  loadFullItem.className = 'card-menu-item';
  loadFullItem.textContent = t('loadFullPlaylist');
  loadFullItem.hidden = true;

  menu.append(adsBtn, loadFullItem, deleteBtn);
  wrap.append(trigger, menu);
  bindHaptic(trigger);
  bindHaptic(loadFullItem);

  trigger.onclick = (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
  };
  document.addEventListener('click', () => {
    menu.hidden = true;
  });
  menu.onclick = (e) => e.stopPropagation();

  return { wrap, loadFullItem };
}

function renderEditor(el: HTMLElement, listId: string, card: Card): void {
  const form = document.createElement('div');
  form.className = 'card-edit glass-inset';

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
  apiKey: string | undefined,
  loadFullItem: HTMLButtonElement
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
  thumbGrid.hidden = true;

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

  const rowMain = document.createElement('div');
  rowMain.className = 'controls-row controls-row-main';

  const rowToggles = document.createElement('div');
  rowToggles.className = 'controls-row controls-row-toggles';

  const prev = iconButton('prev', t('previous'));
  const play = iconButton('play', t('playPause'));
  const next = iconButton('next', t('next'));

  const orderSeg = createOrderSegment(card.settings.random, (random) => {
    updateCard(listId, card.id, {
      settings: { ...card.settings, random },
      shuffleSeed: Date.now(),
      currentVideoIndex: 0,
    });
    card.settings.random = random;
    reloadVideos();
  });

  const videoBtn = iconButton(card.settings.showVideo ? 'video' : 'videoOff', t('showVideo'));
  videoBtn.classList.toggle('active', card.settings.showVideo);

  const autoBtn = iconButton('autoplay', t('autoplayNext'));
  autoBtn.classList.toggle('active', card.settings.autoplayNext);

  const searchBtn = iconButton('search', t('search'));

  loadFullItem.onclick = () => {
    const menu = loadFullItem.closest('.card-menu-dropdown');
    if (menu instanceof HTMLElement) menu.hidden = true;
    void reloadVideos(true);
  };

  const ctrl = new YouTubePlayerController(
    playerHost,
    card.settings,
    () => {
      void maybeLoadMore().then(() => {
        if (card.settings.autoplayNext) skipNext(1);
        else setPlayIcon(false);
      });
    },
    (c, d) => seek.update(c, d),
    () => {
      log.warn('player', 'Video playback error, skipping');
      showToast(t('videoSkipped'));
      skipNext(1);
    }
  );
  controllers.set(card.id, ctrl);

  const volumeEl = createVolumeSlider((v) => ctrl.setVolume(v), ctrl.getVolume());

  rowMain.append(prev, play, next, volumeEl);
  rowToggles.append(orderSeg, videoBtn, autoBtn, searchBtn);
  controls.append(rowMain, rowToggles);
  el.append(nowPlaying, playerWrap, thumbGrid, seek.el, timeRow, controls);

  let videos: VideoEntry[] = [];
  let index = card.currentVideoIndex ?? 0;
  let duration = 0;
  let loadingMore = false;
  let truncatedMeta: PlaylistTruncation[] = [];
  let ownsPlaylistSidebar = false;

  function setPlayIcon(playing: boolean): void {
    setIcon(play, playing ? 'pause' : 'play');
  }

  function nextPlayableIndex(from: number, step: number): number {
    if (!videos.length) return 0;
    for (let n = 1; n <= videos.length; n++) {
      const i = (from + step * n + videos.length * 10) % videos.length;
      if (!videos[i]?.unavailable) return i;
    }
    return from;
  }

  function skipNext(delta: number): void {
    if (!videos.length) return;
    const target = nextPlayableIndex(index, delta >= 0 ? 1 : -1);
    go(target, true);
  }

  async function maybeLoadMore(): Promise<void> {
    if (loadingMore || index < videos.length - 3) return;
    loadingMore = true;
    nowPlaying.dataset.loading = '1';
    const hint = nowPlaying.querySelector('.load-hint');
    if (!hint) {
      const span = document.createElement('span');
      span.className = 'load-hint';
      span.textContent = t('loadingMore');
      nowPlaying.appendChild(span);
    }
    try {
      const fresh = await refreshPlaylistVideos(card.playlistIds, apiKey);
      const before = videos.length;
      videos = mergeVideoLists(videos, fresh);
      if (card.settings.random && videos.length > before) {
        const tail = videos.slice(before);
        videos = [...videos.slice(0, before), ...orderVideos(tail, true, Date.now())];
      }
      updateNowPlaying();
      log.info('player', 'Loaded more videos', { added: videos.length - before, total: videos.length });
    } catch (e) {
      log.warn('player', 'Load more failed', { error: String(e) });
    } finally {
      loadingMore = false;
      nowPlaying.querySelector('.load-hint')?.remove();
    }
  }

  function adjustIndexAfterReorder(cur: number, from: number, to: number): number {
    if (cur === from) return to;
    if (from < cur && to >= cur) return cur - 1;
    if (from > cur && to <= cur) return cur + 1;
    return cur;
  }

  function reorderQueue(from: number, to: number): void {
    if (from === to || from < 0 || to < 0 || from >= videos.length || to >= videos.length) return;
    const next = [...videos];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    videos = next;
    index = adjustIndexAfterReorder(index, from, to);
    updateCard(listId, card.id, { currentVideoIndex: index });
    refreshPlaylistSidebar();
  }

  function isTruncated(): boolean {
    const t0 = truncatedMeta[0];
    return (
      truncatedMeta.length > 0 ||
      (t0?.total != null && videos.length < (t0.total ?? 0) * 0.95)
    );
  }

  function sidebarConfig(): PlaylistSidebarConfig {
    return {
      videos,
      currentIndex: index,
      onPick: (i) => go(i, true),
      onReorder: reorderQueue,
      truncated: isTruncated(),
      onLoadFull: () => void reloadVideos(true),
    };
  }

  function syncVideoPanel(): void {
    const show = card.settings.showVideo && videos.length > 0;
    playerWrap.classList.toggle('audio-only', !card.settings.showVideo);
    if (!show) {
      hidePlaylistSidebar();
      ownsPlaylistSidebar = false;
      return;
    }
    ownsPlaylistSidebar = true;
    showPlaylistSidebar(sidebarConfig());
  }

  function refreshPlaylistSidebar(): void {
    if (ownsPlaylistSidebar && card.settings.showVideo) {
      updatePlaylistSidebar(sidebarConfig());
    }
  }

  function go(deltaOrIndex: number, absolute = false): void {
    if (!videos.length) return;
    let target = absolute ? deltaOrIndex : (index + deltaOrIndex + videos.length) % videos.length;
    if (videos[target]?.unavailable) target = nextPlayableIndex(target, 1);
    index = target;
    updateCard(listId, card.id, { currentVideoIndex: index });
    const v = videos[index];
    void ctrl.load(v.videoId, true).then(() => setPlayIcon(true));
    updateNowPlaying();
    refreshPlaylistSidebar();
    void maybeLoadMore();
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
    if (!ctrl.hasPlayer()) {
      void ctrl.load(videos[index].videoId, true).then(() => setPlayIcon(true));
    } else if (ctrl.isPlaying()) {
      ctrl.pause();
      setPlayIcon(false);
    } else {
      ctrl.resume();
      setPlayIcon(true);
    }
  };
  prev.onclick = () => skipNext(-1);
  next.onclick = () => skipNext(1);

  videoBtn.onclick = () => {
    const showVideo = !card.settings.showVideo;
    updateCard(listId, card.id, { settings: { ...card.settings, showVideo } });
    card.settings.showVideo = showVideo;
    videoBtn.classList.toggle('active', showVideo);
    setIcon(videoBtn, showVideo ? 'video' : 'videoOff');
    ctrl.updateSettings(card.settings);
    syncVideoPanel();
  };

  const focused = () => getState().focusedCardId === card.id;

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

  async function reloadVideos(forceRefresh = false): Promise<void> {
    nowPlaying.innerHTML = '';
    nowPlaying.appendChild(createSkeletonCard());
    loadFullItem.hidden = true;
    try {
      const { videos: raw, truncated } = await fetchAllPlaylistVideos(
        card.playlistIds,
        apiKey,
        forceRefresh
      );
      truncatedMeta = truncated;
      if (!forceRefresh) notifyPlaylistTruncation(truncated);
      const seed = card.shuffleSeed ?? Date.now();
      videos = orderVideos(raw, card.settings.random, seed);
      if (!card.shuffleSeed) updateCard(listId, card.id, { shuffleSeed: seed });
      index = Math.min(card.currentVideoIndex ?? 0, Math.max(0, videos.length - 1));
      if (videos[index]?.unavailable) index = nextPlayableIndex(index, 1);
      updateNowPlaying();
      updateLoadFullBtn();
      syncVideoPanel();
      log.info('player', 'Card ready', { card: card.name, videos: videos.length });
    } catch (e) {
      nowPlaying.innerHTML = `<strong>${t('noVideos')}</strong>${t('fetchErrorHint')}`;
      log.error('player', 'Load failed', { error: String(e) });
    }
  }

  function updateLoadFullBtn(): void {
    loadFullItem.hidden = !isTruncated();
  }

  [prev, play, next, videoBtn, autoBtn, searchBtn].forEach(bindHaptic);

  setFocusedCard(card.id);
  reloadVideos();
}

function createOrderSegment(initialRandom: boolean, onChange: (random: boolean) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'segmented';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', t('random'));

  let isRandom = initialRandom;

  const seqBtn = document.createElement('button');
  seqBtn.type = 'button';
  seqBtn.className = 'segmented-btn' + (!isRandom ? ' active' : '');
  seqBtn.textContent = t('orderSequential');

  const rndBtn = document.createElement('button');
  rndBtn.type = 'button';
  rndBtn.className = 'segmented-btn' + (isRandom ? ' active' : '');
  rndBtn.textContent = t('orderRandom');

  const syncUi = () => {
    seqBtn.classList.toggle('active', !isRandom);
    rndBtn.classList.toggle('active', isRandom);
  };

  seqBtn.onclick = () => {
    if (!isRandom) return;
    isRandom = false;
    syncUi();
    onChange(false);
  };
  rndBtn.onclick = () => {
    if (isRandom) return;
    isRandom = true;
    syncUi();
    onChange(true);
  };
  wrap.append(seqBtn, rndBtn);
  return wrap;
}

function createVolumeSlider(onChange: (v: number) => void, initial = 100): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'volume-control';
  wrap.title = t('volume');
  wrap.dataset.tooltip = t('volume');
  const icon = document.createElement('span');
  icon.className = 'volume-icon';
  icon.innerHTML = icons.volume;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '100';
  input.value = String(initial);
  input.className = 'volume-slider';
  input.oninput = () => onChange(Number(input.value));
  wrap.append(icon, input);
  return wrap;
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
