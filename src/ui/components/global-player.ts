import type { VideoEntry, CardSettings } from '@/core/models/workspace';
import { YouTubePlayerController } from '@/core/youtube/player';
import { createSeekBar, formatTime } from './seek-bar';
import { t } from '@/i18n';
import { bindHaptic } from '@/ui/haptics';

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
let titleEl: HTMLElement | null = null;
let metaEl: HTMLElement | null = null;
let seekUpdater: ((c: number, d: number) => void) | null = null;
let durationCache = 0;
let onChange: (() => void) | null = null;
let domReady = false;

export function setGlobalPlayerMount(el: HTMLElement, cb: () => void): void {
  rootEl = el;
  onChange = cb;
  renderShell();
}

export function getGlobalSession(): GlobalPlayerSession | null {
  return session;
}

export function startGlobalSession(s: Omit<GlobalPlayerSession, 'playing'>): void {
  controller?.destroy();
  controller = null;
  domReady = false;
  session = { ...s, playing: false };
  document.body.classList.add('has-global-player');
  renderShell();
  if (session.videos.length) void playAt(session.index);
}

export function closeGlobalPlayer(): void {
  controller?.destroy();
  controller = null;
  session = null;
  domReady = false;
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
  void playAt(session.index);
}

export function globalNext(): void {
  if (!session?.videos.length) return;
  session.index = (session.index + 1) % session.videos.length;
  void playAt(session.index);
}

export function globalTogglePlay(): void {
  if (!session?.videos.length) return;
  if (!controller) {
    void playAt(session.index);
    return;
  }
  if (session.playing) {
    controller.pause();
    session.playing = false;
  } else {
    controller.resume();
    session.playing = true;
  }
  if (playBtnEl) playBtnEl.textContent = session.playing ? '⏸' : '▶';
}

async function playAt(index: number): Promise<void> {
  if (!session || !hostEl) return;
  const v = session.videos[index];
  if (!v) return;
  session.index = index;
  updateMeta();

  if (!controller) {
    controller = new YouTubePlayerController(
      hostEl,
      session.settings,
      () => {
        if (session?.settings.autoplayNext) globalNext();
        else if (session) {
          session.playing = false;
          if (playBtnEl) playBtnEl.textContent = '▶';
        }
        onChange?.();
      },
      (cur, dur) => {
        durationCache = dur;
        seekUpdater?.(cur, dur);
      }
    );
  }
  await controller.init(v.videoId);
  session.playing = true;
  if (playBtnEl) playBtnEl.textContent = '⏸';
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

  const controls = document.createElement('div');
  controls.className = 'global-player-controls';
  const prev = btn('⏮', t('previous'), () => globalPrev());
  playBtnEl = btn(session.playing ? '⏸' : '▶', t('playPause'), () => globalTogglePlay());
  const next = btn('⏭', t('next'), () => globalNext());
  const close = btn('✕', t('closePlayer'), () => closeGlobalPlayer());
  controls.append(prev, playBtnEl, next, close);

  bar.append(info, hostEl, seek.el, timeRow, controls);
  rootEl.appendChild(bar);
  domReady = true;
  updateMeta();
}

function btn(icon: string, label: string, fn: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn btn-icon';
  b.textContent = icon;
  b.title = label;
  b.onclick = fn;
  bindHaptic(b);
  return b;
}
