import type { VideoEntry, CardSettings } from '@/core/models/workspace';
import { youtubeThumbUrl } from '@/core/models/workspace';
import { YouTubePlayerController, VOLUME_SLIDER_MAX } from '@/core/youtube/player';
import { onGlobalPlaybackStart, listenForPlaybackCoordination } from '@/core/playback/coordinator';
import { createSeekBar, formatTime } from './seek-bar';
import { openSearchPanel } from './search-panel';
import {
  showPlaylistSidebar,
  hidePlaylistSidebar,
  updatePlaylistSidebar,
  type PlaylistSidebarConfig,
} from './playlist-sidebar';
import { t } from '@/i18n';
import { bindHaptic } from '@/ui/haptics';
import { iconButton, icons, setIcon } from '@/ui/icons';
import { showToast } from '@/app/toast';

export interface GlobalPlayerSession {
  listId: string;
  listName: string;
  videos: VideoEntry[];
  index: number;
  settings: CardSettings;
  playing: boolean;
}

let session: GlobalPlayerSession | null = null;
let controller: YouTubePlayerController | null = null;
let rootEl: HTMLElement | null = null;
let hostEl: HTMLElement | null = null;
let playBtnEl: HTMLButtonElement | null = null;
let videoBtnEl: HTMLButtonElement | null = null;
let autoBtnEl: HTMLButtonElement | null = null;
let titleEl: HTMLElement | null = null;
let metaEl: HTMLElement | null = null;
let seekUpdater: ((c: number, duration: number) => void) | null = null;
let durationCache = 0;
let onChange: (() => void) | null = null;
let domReady = false;
let ownsPlaylistSidebar = false;

export function setGlobalPlayerMount(el: HTMLElement, cb: () => void): void {
  rootEl = el;
  onChange = cb;
  listenForPlaybackCoordination({ onPauseGlobal: () => pauseGlobalPlayback() });
  renderShell();
}

export function getGlobalSession(): GlobalPlayerSession | null {
  return session;
}

export function pauseGlobalPlayback(): void {
  if (!session || !controller?.isPlaying()) return;
  controller.pause();
  session.playing = false;
  if (playBtnEl) setIcon(playBtnEl, 'play');
}

export function startGlobalSession(s: Omit<GlobalPlayerSession, 'playing'>): void {
  controller?.destroy();
  controller = null;
  domReady = false;
  ownsPlaylistSidebar = false;
  session = { ...s, playing: false };
  document.body.classList.add('has-global-player');
  renderShell();
  if (session.videos.length) void playAt(session.index, true);
}

export function closeGlobalPlayer(): void {
  controller?.destroy();
  controller = null;
  session = null;
  domReady = false;
  ownsPlaylistSidebar = false;
  hidePlaylistSidebar();
  document.body.classList.remove('has-global-player');
  if (rootEl) {
    rootEl.innerHTML = '';
    rootEl.classList.remove('visible');
  }
  onChange?.();
}

export function globalPrev(): void {
  if (!session?.videos.length) return;
  session.index = (session.index - 1 + session.videos.length) % session.videos.length;
  void playAt(session.index, true);
}

export function globalNext(): void {
  if (!session?.videos.length) return;
  session.index = (session.index + 1) % session.videos.length;
  void playAt(session.index, true);
}

export function globalTogglePlay(): void {
  if (!session?.videos.length) return;
  if (!controller?.hasPlayer()) {
    void playAt(session.index, true);
    return;
  }
  if (controller.isPlaying()) {
    controller.pause();
    session.playing = false;
  } else {
    onGlobalPlaybackStart();
    controller.resume();
    session.playing = true;
  }
  if (playBtnEl) setIcon(playBtnEl, session.playing ? 'pause' : 'play');
}

function sidebarConfig(): PlaylistSidebarConfig | null {
  if (!session) return null;
  return {
    videos: session.videos,
    currentIndex: session.index,
    onPick: (i) => void playAt(i, true),
    truncated: false,
  };
}

function syncVideoPanel(): void {
  if (!session) return;
  const show = session.settings.showVideo && session.videos.length > 0;
  if (hostEl) {
    hostEl.classList.toggle('sr-only', !show);
    hostEl.classList.toggle('global-player-host-visible', show);
  }
  if (!show) {
    hidePlaylistSidebar();
    ownsPlaylistSidebar = false;
    return;
  }
  const cfg = sidebarConfig();
  if (!cfg) return;
  ownsPlaylistSidebar = true;
  showPlaylistSidebar(cfg);
}

function refreshPlaylistSidebar(): void {
  if (!ownsPlaylistSidebar || !session?.settings.showVideo) return;
  const cfg = sidebarConfig();
  if (cfg) updatePlaylistSidebar(cfg);
}

async function playAt(index: number, autoplay: boolean): Promise<void> {
  if (!session || !hostEl) return;
  const v = session.videos[index];
  if (!v) return;
  if (autoplay) onGlobalPlaybackStart();
  session.index = index;
  updateMeta();
  syncVideoPanel();
  refreshPlaylistSidebar();

  if (!controller) {
    controller = new YouTubePlayerController(
      hostEl,
      session.settings,
      () => {
        if (session?.settings.autoplayNext) globalNext();
        else if (session) {
          session.playing = false;
          if (playBtnEl) setIcon(playBtnEl, 'play');
        }
        onChange?.();
      },
      (cur, dur) => {
        durationCache = dur;
        seekUpdater?.(cur, dur);
      },
      () => {
        showToast(t('videoSkipped'));
        globalNext();
      },
      (playing) => {
        if (session) session.playing = playing;
        if (playBtnEl) setIcon(playBtnEl, playing ? 'pause' : 'play');
      }
    );
  } else {
    controller.updateSettings(session.settings);
  }

  await controller.load(v.videoId, autoplay);
  session.playing = autoplay;
  if (playBtnEl) setIcon(playBtnEl, session.playing ? 'pause' : 'play');
  onChange?.();
}

function updateMeta(): void {
  if (!session || !titleEl || !metaEl) return;
  const v = session.videos[session.index];
  titleEl.textContent = v?.title ?? '';
  metaEl.textContent = `${session.listName} · ${session.index + 1}/${session.videos.length}`;
}

function renderShell(): void {
  if (!rootEl) return;
  if (!session) {
    rootEl.innerHTML = '';
    rootEl.classList.remove('visible');
    domReady = false;
    return;
  }
  rootEl.classList.add('visible');

  if (domReady) {
    updateMeta();
    syncVideoPanel();
    refreshPlaylistSidebar();
    return;
  }

  rootEl.innerHTML = '';
  const bar = document.createElement('div');
  bar.className = 'global-player glass';

  const info = document.createElement('div');
  info.className = 'global-player-info';
  const label = document.createElement('span');
  label.className = 'global-label';
  label.textContent = t('globalPlayerLabel');
  titleEl = document.createElement('strong');
  metaEl = document.createElement('span');
  metaEl.className = 'global-meta';
  info.append(label, titleEl, metaEl);

  hostEl = document.createElement('div');
  hostEl.className = 'global-player-host';
  if (!session.settings.showVideo) hostEl.classList.add('sr-only');

  const seek = createSeekBar((frac) => {
    if (durationCache > 0) controller?.seek(frac * durationCache);
  }, () => t('seek'));
  seekUpdater = seek.update;

  const timeRow = document.createElement('div');
  timeRow.className = 'seek-times';
  const curEl = document.createElement('span');
  const durEl = document.createElement('span');
  timeRow.append(curEl, durEl);
  const base = seek.update;
  seekUpdater = (c, d) => {
    base(c, d);
    curEl.textContent = formatTime(c);
    durEl.textContent = formatTime(d);
  };

  const volWrap = document.createElement('label');
  volWrap.className = 'volume-control';
  volWrap.dataset.tooltip = t('volume');
  const volIcon = document.createElement('span');
  volIcon.className = 'volume-icon';
  volIcon.innerHTML = icons.volume;
  const volInput = document.createElement('input');
  volInput.type = 'range';
  volInput.min = '0';
  volInput.max = String(VOLUME_SLIDER_MAX);
  volInput.value = '100';
  volInput.className = 'volume-slider';
  volInput.oninput = () => controller?.setVolume(Number(volInput.value));
  volWrap.append(volIcon, volInput);

  const rowMain = document.createElement('div');
  rowMain.className = 'controls-row controls-row-main global-controls-main';

  const rowToggles = document.createElement('div');
  rowToggles.className = 'controls-row controls-row-toggles global-controls-toggles';

  const prev = mkBtn('prev', t('previous'), () => globalPrev());
  playBtnEl = mkBtn('play', t('playPause'), () => globalTogglePlay());
  const next = mkBtn('next', t('next'), () => globalNext());

  videoBtnEl = iconButton(session.settings.showVideo ? 'video' : 'videoOff', t('showVideo'));
  videoBtnEl.classList.toggle('active', session.settings.showVideo);
  videoBtnEl.onclick = () => {
    if (!session) return;
    const showVideo = !session.settings.showVideo;
    session.settings = { ...session.settings, showVideo };
    setIcon(videoBtnEl!, showVideo ? 'video' : 'videoOff');
    videoBtnEl!.classList.toggle('active', showVideo);
    controller?.updateSettings(session.settings);
    syncVideoPanel();
  };

  autoBtnEl = iconButton('autoplay', t('autoplayNext'));
  autoBtnEl.classList.toggle('active', session.settings.autoplayNext);
  autoBtnEl.onclick = () => {
    if (!session) return;
    session.settings = { ...session.settings, autoplayNext: !session.settings.autoplayNext };
    autoBtnEl!.classList.toggle('active', session.settings.autoplayNext);
  };

  const searchBtn = iconButton('search', t('search'));
  searchBtn.onclick = () => {
    if (!session?.videos.length) return;
    openSearchPanel(session.videos, (_, idx) => void playAt(idx, true));
  };

  const close = mkBtn('close', t('closePlayer'), () => closeGlobalPlayer());

  rowMain.append(prev, playBtnEl, next, volWrap);
  rowToggles.append(videoBtnEl, autoBtnEl, searchBtn);
  bindHaptic(videoBtnEl);
  bindHaptic(autoBtnEl);
  bindHaptic(searchBtn);

  const controls = document.createElement('div');
  controls.className = 'global-player-controls';
  controls.append(rowMain, rowToggles, close);

  const body = document.createElement('div');
  body.className = 'global-player-body';
  body.append(info, hostEl, seek.el, timeRow, controls);
  bar.append(body);
  rootEl.appendChild(bar);
  domReady = true;
  updateMeta();
  syncVideoPanel();
}

function mkBtn(icon: 'prev' | 'play' | 'pause' | 'next' | 'close', label: string, fn: () => void): HTMLButtonElement {
  const b = iconButton(icon === 'pause' ? 'pause' : icon, label);
  b.onclick = fn;
  bindHaptic(b);
  return b;
}
