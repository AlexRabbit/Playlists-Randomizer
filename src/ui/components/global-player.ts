import type { VideoEntry, CardSettings } from '@/core/models/workspace';
import { youtubeThumbUrl } from '@/core/models/workspace';
import { YouTubePlayerController } from '@/core/youtube/player';
import { createSeekBar, formatTime } from './seek-bar';
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
let titleEl: HTMLElement | null = null;
let metaEl: HTMLElement | null = null;
let queueEl: HTMLElement | null = null;
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
  if (session.videos.length) void playAt(session.index, true);
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
    controller.resume();
    session.playing = true;
  }
  if (playBtnEl) setIcon(playBtnEl, session.playing ? 'pause' : 'play');
}

async function playAt(index: number, autoplay: boolean): Promise<void> {
  if (!session || !hostEl) return;
  const v = session.videos[index];
  if (!v) return;
  session.index = index;
  updateMeta();
  renderQueue();

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
      }
    );
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

function renderQueue(): void {
  if (!queueEl || !session) return;
  queueEl.innerHTML = '';
  session.videos.forEach((v, i) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'queue-row' + (i === session!.index ? ' active' : '');
    row.innerHTML = `<img src="${youtubeThumbUrl(v.videoId)}" alt="" loading="lazy" /><span>${esc(v.title)}</span>`;
    row.onclick = () => void playAt(i, true);
    bindHaptic(row);
    queueEl!.appendChild(row);
  });
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
    renderQueue();
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

  const queueDetails = document.createElement('details');
  queueDetails.className = 'queue-panel';
  const queueSum = document.createElement('summary');
  queueSum.textContent = `${t('queue')} (${session.videos.length})`;
  queueEl = document.createElement('div');
  queueEl.className = 'queue-list glass-scroll';
  queueDetails.append(queueSum, queueEl);

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
  volInput.max = '100';
  volInput.value = '100';
  volInput.className = 'volume-slider';
  volInput.oninput = () => controller?.setVolume(Number(volInput.value));
  volWrap.append(volIcon, volInput);

  const controls = document.createElement('div');
  controls.className = 'global-player-controls';
  const prev = mkBtn('prev', t('previous'), () => globalPrev());
  playBtnEl = mkBtn('play', t('playPause'), () => globalTogglePlay());
  const next = mkBtn('next', t('next'), () => globalNext());
  const close = mkBtn('close', t('closePlayer'), () => closeGlobalPlayer());
  controls.append(prev, playBtnEl, next, volWrap, close);

  const body = document.createElement('div');
  body.className = 'global-player-body';
  body.append(info, queueDetails, hostEl, seek.el, timeRow, controls);
  bar.append(body);
  rootEl.appendChild(bar);
  domReady = true;
  updateMeta();
  renderQueue();
}

function mkBtn(icon: 'prev' | 'play' | 'pause' | 'next' | 'close', label: string, fn: () => void): HTMLButtonElement {
  const b = iconButton(icon === 'pause' ? 'pause' : icon, label);
  b.onclick = fn;
  bindHaptic(b);
  return b;
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
