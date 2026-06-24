import type { Card } from '@/core/models/workspace';
import {
  deleteCard,
  setEditingCard,
  saveCardPlaylists,
  updateCard,
} from '@/app/store';
import {
  fetchAllPlaylistVideos,
  orderVideos,
} from '@/core/youtube/playlist';
import { YouTubePlayerController } from '@/core/youtube/player';
import type { VideoEntry } from '@/core/models/workspace';
import { log } from '@/logs/logger';

const controllers = new Map<string, YouTubePlayerController>();

export function mountCard(
  el: HTMLElement,
  listId: string,
  card: Card,
  editing: boolean
): void {
  el.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'card-header';
  const title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = card.name;
  header.appendChild(title);

  const headerActions = document.createElement('div');
  headerActions.style.display = 'flex';
  headerActions.style.gap = '0.35rem';

  if (!editing && card.playlistIds.length) {
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-icon';
    editBtn.innerHTML = '✎';
    editBtn.title = 'Edit playlists';
    editBtn.onclick = () => setEditingCard(card.id);
    headerActions.appendChild(editBtn);
  }

  const delBtn = document.createElement('button');
  delBtn.className = 'btn btn-icon btn-danger';
  delBtn.innerHTML = '×';
  delBtn.title = 'Delete card';
  delBtn.onclick = () => {
    if (confirm(`Delete card "${card.name}"?`)) {
      controllers.get(card.id)?.destroy();
      controllers.delete(card.id);
      deleteCard(listId, card.id);
    }
  };
  headerActions.appendChild(delBtn);
  header.appendChild(headerActions);
  el.appendChild(header);

  if (editing || !card.playlistIds.length) {
    renderEditor(el, listId, card);
    return;
  }

  renderPlayer(el, listId, card);
}

function renderEditor(el: HTMLElement, listId: string, card: Card): void {
  const form = document.createElement('div');
  form.className = 'card-edit';

  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Card name';
  const nameInput = document.createElement('input');
  nameInput.value = card.name;
  nameLabel.appendChild(nameInput);

  const plLabel = document.createElement('label');
  plLabel.textContent = 'YouTube playlist URLs or IDs (one per line)';
  const plText = document.createElement('textarea');
  plText.placeholder = 'https://www.youtube.com/playlist?list=PL...\nPLxxxxxxxx';
  plText.value = card.playlistIds.join('\n');
  plLabel.appendChild(plText);

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '0.5rem';
  actions.style.marginTop = '0.5rem';

  const save = document.createElement('button');
  save.className = 'btn btn-primary';
  save.textContent = 'Save & Play';
  save.onclick = () => {
    updateCard(listId, card.id, { name: nameInput.value.trim() || card.name });
    saveCardPlaylists(listId, card.id, plText.value);
  };

  const cancel = document.createElement('button');
  cancel.className = 'btn';
  cancel.textContent = 'Cancel';
  cancel.onclick = () => setEditingCard(null);

  actions.append(save, cancel);
  form.append(nameLabel, plLabel, actions);
  el.appendChild(form);
}

function renderPlayer(el: HTMLElement, listId: string, card: Card): void {
  const nowPlaying = document.createElement('div');
  nowPlaying.className = 'now-playing';
  nowPlaying.textContent = 'Loading playlists…';

  const playerWrap = document.createElement('div');
  playerWrap.className = 'player-area' + (card.settings.showVideo ? '' : ' audio-only');
  const playerHost = document.createElement('div');
  playerHost.id = `yt-${card.id}`;
  playerWrap.appendChild(playerHost);

  const controls = document.createElement('div');
  controls.className = 'controls';

  const prev = iconBtn('⏮', 'Previous');
  const play = iconBtn('▶', 'Play / Pause');
  const next = iconBtn('⏭', 'Next');

  const randomBtn = iconBtn('🔀', 'Randomize order');
  randomBtn.classList.toggle('active', card.settings.random);
  const videoBtn = iconBtn('📺', 'Show video');
  videoBtn.classList.toggle('active', card.settings.showVideo);
  const adsBtn = iconBtn('🚫', 'Minimize ads (experimental)');
  adsBtn.classList.toggle('active', card.settings.noAds);

  controls.append(prev, play, next);
  const spacer = document.createElement('span');
  spacer.className = 'spacer';
  controls.append(spacer, randomBtn, videoBtn, adsBtn);
  el.append(nowPlaying, playerWrap, controls);

  let videos: VideoEntry[] = [];
  let index = card.currentVideoIndex ?? 0;
  let loading = true;
  let playing = false;

  const ctrl = new YouTubePlayerController(playerHost, card.settings, () => {
    go(1);
  });
  controllers.set(card.id, ctrl);

  function iconBtn(icon: string, label: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-icon';
    b.innerHTML = icon;
    b.title = label;
    b.setAttribute('aria-label', label);
    return b;
  }

  function updateNowPlaying(): void {
    const v = videos[index];
    if (!v) {
      nowPlaying.innerHTML = '<strong>No videos</strong>Check playlist URLs are public.';
      return;
    }
    nowPlaying.innerHTML = `<strong>${escapeHtml(v.title)}</strong>${index + 1} / ${videos.length}`;
  }

  function go(delta: number): void {
    if (!videos.length) return;
    index = (index + delta + videos.length) % videos.length;
    updateCard(listId, card.id, { currentVideoIndex: index });
    const v = videos[index];
    ctrl.play(v.videoId);
    playing = true;
    play.innerHTML = '⏸';
    updateNowPlaying();
  }

  play.onclick = () => {
    if (!videos.length) return;
    if (!playing) {
      const v = videos[index];
      ctrl.init(v.videoId).then(() => {
        playing = true;
        play.innerHTML = '⏸';
      });
    } else {
      ctrl.pause();
      playing = false;
      play.innerHTML = '▶';
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
    ctrl.updateSettings(card.settings);
  };

  adsBtn.onclick = () => {
    const noAds = !card.settings.noAds;
    updateCard(listId, card.id, { settings: { ...card.settings, noAds } });
    card.settings.noAds = noAds;
    adsBtn.classList.toggle('active', noAds);
    ctrl.updateSettings(card.settings);
  };

  async function reloadVideos(): Promise<void> {
    loading = true;
    nowPlaying.textContent = 'Loading playlists…';
    try {
      const raw = await fetchAllPlaylistVideos(card.playlistIds);
      const seed = card.shuffleSeed ?? Date.now();
      videos = orderVideos(raw, card.settings.random, seed);
      if (!card.shuffleSeed) {
        updateCard(listId, card.id, { shuffleSeed: seed });
      }
      index = Math.min(card.currentVideoIndex ?? 0, Math.max(0, videos.length - 1));
      updateNowPlaying();
      log.info('player', 'Card ready', { card: card.name, videos: videos.length });
    } catch (e) {
      nowPlaying.textContent = `Error: ${String(e)}`;
      log.error('player', 'Load failed', { error: String(e) });
    } finally {
      loading = false;
    }
  }

  reloadVideos();
}

function escapeHtml(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
