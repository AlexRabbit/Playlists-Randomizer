import type { VideoEntry, CardSettings } from '@/core/models/workspace';
import { YouTubePlayerController } from '@/core/youtube/player';
import { orderVideos } from '@/core/youtube/playlist';
import { onGlobalPlaybackStart, listenForPlaybackCoordination } from '@/core/playback/coordinator';
import { createSeekBar, formatTime } from './seek-bar';
import { openSearchPanel } from './search-panel';
import {
  showPlaylistSidebar,
  hidePlaylistSidebar,
  updatePlaylistSidebar,
  type PlaylistSidebarConfig,
} from './playlist-sidebar';
import { createOrderSegment, createVolumeSlider } from './player-controls';
import { createVideoOverlay, removeVideoOverlaysForMount } from './video-overlay';
import { t } from '@/i18n';
import { bindHaptic } from '@/ui/haptics';
import { iconButton, setIcon } from '@/ui/icons';
import { showToast } from '@/app/toast';

export interface GlobalPlayerSession {
  listId: string;
  listName: string;
  videos: VideoEntry[];
  index: number;
  settings: CardSettings;
  playing: boolean;
}

const GLOBAL_MOUNT_KEY = 'global';

let session: GlobalPlayerSession | null = null;
let controller: YouTubePlayerController | null = null;
let overlay: ReturnType<typeof createVideoOverlay> | null = null;
let rootEl: HTMLElement | null = null;
let playBtnEl: HTMLButtonElement | null = null;
let videoBtnEl: HTMLButtonElement | null = null;
let queueBtnEl: HTMLButtonElement | null = null;
let autoBtnEl: HTMLButtonElement | null = null;
let titleEl: HTMLElement | null = null;
let metaEl: HTMLElement | null = null;
let seekUpdater: ((c: number, duration: number) => void) | null = null;
let durationCache = 0;
let onChange: (() => void) | null = null;
let domReady = false;
let queuePanelOpen = false;
let ownsPlaylistSidebar = false;
let dockControlsFn: (() => void) | null = null;

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
  teardownOverlay();
  controller?.destroy();
  controller = null;
  domReady = false;
  queuePanelOpen = false;
  ownsPlaylistSidebar = false;
  hidePlaylistSidebar();
  session = { ...s, playing: false };
  document.body.classList.add('has-global-player');
  renderShell();
  if (session.videos.length) void playAt(session.index, true);
}

export function closeGlobalPlayer(): void {
  teardownOverlay();
  controller?.destroy();
  controller = null;
  session = null;
  domReady = false;
  queuePanelOpen = false;
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

function teardownOverlay(): void {
  overlay?.destroy();
  overlay = null;
  removeVideoOverlaysForMount(GLOBAL_MOUNT_KEY);
}

function sidebarConfig(): PlaylistSidebarConfig | null {
  if (!session) return null;
  return {
    videos: session.videos,
    currentIndex: session.index,
    onPick: (i) => void playAt(i, true),
    onReorder: reorderGlobalQueue,
    truncated: false,
  };
}

function adjustIndexAfterReorder(cur: number, from: number, to: number): number {
  if (cur === from) return to;
  if (from < cur && to >= cur) return cur - 1;
  if (from > cur && to <= cur) return cur + 1;
  return cur;
}

function reorderGlobalQueue(from: number, to: number): void {
  if (!session || from === to || from < 0 || to < 0 || from >= session.videos.length || to >= session.videos.length) {
    return;
  }
  const next = [...session.videos];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  session.videos = next;
  session.index = adjustIndexAfterReorder(session.index, from, to);
  updateMeta();
  refreshPlaylistSidebar();
}

function syncQueuePanel(): void {
  if (!session || !queueBtnEl) return;
  queueBtnEl.classList.toggle('active', queuePanelOpen);
  if (!queuePanelOpen || !session.videos.length) {
    if (ownsPlaylistSidebar) {
      hidePlaylistSidebar();
      ownsPlaylistSidebar = false;
    }
    return;
  }
  const cfg = sidebarConfig();
  if (!cfg) return;
  ownsPlaylistSidebar = true;
  showPlaylistSidebar(cfg);
}

function refreshPlaylistSidebar(): void {
  if (ownsPlaylistSidebar && queuePanelOpen) {
    const cfg = sidebarConfig();
    if (cfg) updatePlaylistSidebar(cfg);
  }
}

function syncVideoOverlay(): void {
  if (!session || !overlay) return;
  overlay.sync(session.settings.showVideo && session.videos.length > 0);
}

function closeVideoOverlay(): void {
  if (!session?.settings.showVideo) return;
  session.settings = { ...session.settings, showVideo: false };
  if (videoBtnEl) {
    videoBtnEl.classList.remove('active');
    setIcon(videoBtnEl, 'videoOff');
  }
  overlay?.sync(false);
}

function setPlayIcon(playing: boolean): void {
  if (playBtnEl) setIcon(playBtnEl, playing ? 'pause' : 'play');
  if (session) session.playing = playing;
}

async function playAt(index: number, autoplay: boolean): Promise<void> {
  if (!session || !overlay) return;
  const v = session.videos[index];
  if (!v) return;
  if (autoplay) onGlobalPlaybackStart();
  session.index = index;
  updateMeta();
  refreshPlaylistSidebar();

  if (!controller) {
    controller = new YouTubePlayerController(
      overlay.playerHost,
      session.settings,
      () => {
        if (session?.settings.autoplayNext) globalNext();
        else if (session) {
          session.playing = false;
          setPlayIcon(false);
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
      (playing) => setPlayIcon(playing)
    );
  } else {
    controller.updateSettings(session.settings);
  }

  await controller.load(v.videoId, autoplay);
  session.playing = autoplay;
  setPlayIcon(session.playing);
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
    syncVideoOverlay();
    syncQueuePanel();
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

  const rowMain = document.createElement('div');
  rowMain.className = 'controls-row controls-row-main global-controls-main';

  const rowToggles = document.createElement('div');
  rowToggles.className = 'controls-row controls-row-toggles global-controls-toggles';

  const searchBtn = iconButton('search', t('search'));
  searchBtn.onclick = () => {
    if (!session?.videos.length) return;
    openSearchPanel(session.videos, (v) => {
      const idx = session!.videos.findIndex((x) => x.videoId === v.videoId);
      void playAt(idx >= 0 ? idx : 0, true);
    });
  };

  const prev = mkBtn('prev', t('previous'), () => globalPrev());
  playBtnEl = mkBtn('play', t('playPause'), () => globalTogglePlay());
  const next = mkBtn('next', t('next'), () => globalNext());

  const orderSeg = createOrderSegment(session.settings.random, (random) => {
    if (!session) return;
    const current = session.videos[session.index];
    session.settings = { ...session.settings, random };
    session.videos = orderVideos(session.videos, random, Date.now());
    const newIdx = current ? session.videos.findIndex((v) => v.videoId === current.videoId) : 0;
    session.index = newIdx >= 0 ? newIdx : 0;
    updateMeta();
    refreshPlaylistSidebar();
  });

  videoBtnEl = iconButton(session.settings.showVideo ? 'video' : 'videoOff', t('showVideo'));
  videoBtnEl.classList.toggle('active', session.settings.showVideo);
  videoBtnEl.onclick = () => {
    if (!session) return;
    const showVideo = !session.settings.showVideo;
    session.settings = { ...session.settings, showVideo };
    setIcon(videoBtnEl!, showVideo ? 'video' : 'videoOff');
    videoBtnEl!.classList.toggle('active', showVideo);
    controller?.updateSettings(session.settings);
    syncVideoOverlay();
  };

  queueBtnEl = iconButton('list', t('queuePanel'));
  queueBtnEl.onclick = () => {
    if (!session?.videos.length) {
      showToast(t('noVideosHint'));
      return;
    }
    queuePanelOpen = !queuePanelOpen;
    syncQueuePanel();
  };

  autoBtnEl = iconButton('autoplay', t('autoplayNext'));
  autoBtnEl.classList.toggle('active', session.settings.autoplayNext);
  autoBtnEl.onclick = () => {
    if (!session) return;
    session.settings = { ...session.settings, autoplayNext: !session.settings.autoplayNext };
    autoBtnEl!.classList.toggle('active', session.settings.autoplayNext);
  };

  const close = mkBtn('close', t('closePlayer'), () => closeGlobalPlayer());

  rowMain.append(searchBtn, prev, playBtnEl, next);
  rowToggles.append(orderSeg, videoBtnEl, queueBtnEl, autoBtnEl, close);

  const controls = document.createElement('div');
  controls.className = 'global-player-controls controls';
  controls.append(rowMain, rowToggles);

  const body = document.createElement('div');
  body.className = 'global-player-body';
  body.append(info, seek.el, timeRow, controls);
  bar.append(body);
  rootEl.appendChild(bar);

  dockControlsFn = () => {
    if (seek.el.parentElement !== body) {
      body.append(info, seek.el, timeRow, controls);
    }
  };

  overlay = createVideoOverlay({
    mountKey: GLOBAL_MOUNT_KEY,
    hostId: 'yt-global',
    controller: () => controller!,
    getDock: () => ({ seek: seek.el, timeRow, controls }),
    dockControls: () => dockControlsFn?.(),
    onUserClose: () => closeVideoOverlay(),
    onPlayIcon: setPlayIcon,
    getCastTitle: () => session?.videos[session.index]?.title,
  });

  const volumeEl = createVolumeSlider((v) => void controller?.setVolume(v), controller?.getVolume() ?? 100);
  rowMain.appendChild(volumeEl);

  [searchBtn, prev, playBtnEl, next, videoBtnEl, queueBtnEl, autoBtnEl, close].forEach(bindHaptic);
  domReady = true;
  updateMeta();
  syncVideoOverlay();
  syncQueuePanel();
}

function mkBtn(icon: 'prev' | 'play' | 'pause' | 'next' | 'close', label: string, fn: () => void): HTMLButtonElement {
  const b = iconButton(icon === 'pause' ? 'pause' : icon, label);
  b.onclick = fn;
  bindHaptic(b);
  return b;
}
