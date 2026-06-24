import type { YouTubePlayerController } from '@/core/youtube/player';
import {
  createCastButtonGroup,
  injectCastIntoToggleRow,
  removeCastFromControls,
} from './cast-controls';
import { iconButton } from '@/ui/icons';
import { t } from '@/i18n';
import { bindHaptic } from '@/ui/haptics';

export interface VideoOverlayDock {
  seek: HTMLElement;
  timeRow: HTMLElement;
  controls: HTMLElement;
}

export interface VideoOverlayHandle {
  playerHost: HTMLElement;
  playerMount: HTMLElement;
  sync: (showVideo: boolean) => void;
  isOpen: () => boolean;
  destroy: () => void;
}

export function removeVideoOverlaysForMount(mountKey: string): void {
  document.querySelectorAll(`.player-mount[data-mount-key="${mountKey}"]`).forEach((n) => n.remove());
  document.querySelectorAll('.video-overlay').forEach((n) => n.remove());
  document.body.classList.remove('video-overlay-open');
}

export function createVideoOverlay(options: {
  mountKey: string;
  hostId: string;
  controller: () => YouTubePlayerController;
  getDock: () => VideoOverlayDock;
  dockControls: () => void;
  onUserClose: () => void;
  onPlayIcon?: (playing: boolean) => void;
  getCastTitle?: () => string | undefined;
}): VideoOverlayHandle {
  const playerMount = document.createElement('div');
  playerMount.className = 'player-mount player-mount-hidden';
  playerMount.dataset.mountKey = options.mountKey;

  const playerHost = document.createElement('div');
  playerHost.id = options.hostId;
  playerHost.className = 'player-host';
  playerMount.appendChild(playerHost);
  document.body.appendChild(playerMount);

  const videoOverlay = document.createElement('div');
  videoOverlay.className = 'video-overlay';
  videoOverlay.hidden = true;

  const videoBackdrop = document.createElement('div');
  videoBackdrop.className = 'video-float-backdrop';
  videoBackdrop.setAttribute('aria-hidden', 'true');

  const videoPanel = document.createElement('div');
  videoPanel.className = 'video-overlay-panel glass-elevated';

  const videoCloseBtn = iconButton('close', t('closeVideo'));
  videoCloseBtn.className = 'btn btn-icon btn-icon-svg video-float-close';
  bindHaptic(videoCloseBtn);

  const castRow = createCastButtonGroup({
    controller: options.controller,
    getCastTitle: options.getCastTitle,
  });

  videoOverlay.append(videoBackdrop, videoPanel);

  let overlayOpen = false;
  let stageEl: HTMLElement | null = null;
  let positionListener: (() => void) | null = null;
  let stageObserver: ResizeObserver | null = null;
  let keyListener: ((e: KeyboardEvent) => void) | null = null;

  function positionPlayerOverStage(): void {
    if (!stageEl || !overlayOpen) return;
    const r = stageEl.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    playerMount.style.left = `${r.left}px`;
    playerMount.style.top = `${r.top}px`;
    playerMount.style.width = `${r.width}px`;
    playerMount.style.height = `${r.height}px`;
  }

  function toggleStageFullscreen(): void {
    const target = playerMount;
    if (document.fullscreenElement === target) {
      void document.exitFullscreen();
      return;
    }
    void target.requestFullscreen?.().catch(() => {
      /* unsupported or blocked */
    });
  }

  function isTypingTarget(el: EventTarget | null): boolean {
    const node = el as HTMLElement | null;
    if (!node) return false;
    const tag = node.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || node.isContentEditable;
  }

  function bindOverlayKeys(): void {
    if (keyListener) return;
    keyListener = (e: KeyboardEvent) => {
      if (!overlayOpen || isTypingTarget(e.target)) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        options.onUserClose();
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleStageFullscreen();
      }
    };
    document.addEventListener('keydown', keyListener);
  }

  function unbindOverlayKeys(): void {
    if (!keyListener) return;
    document.removeEventListener('keydown', keyListener);
    keyListener = null;
  }

  function open(): void {
    const ctrl = options.controller();
    if (overlayOpen) {
      positionPlayerOverStage();
      return;
    }

    const shouldPlay = ctrl.wantsPlayback();
    const pos = ctrl.getPlaybackTime();
    const dock = options.getDock();

    overlayOpen = true;
    videoOverlay.hidden = false;
    if (!videoOverlay.isConnected) document.body.appendChild(videoOverlay);

    stageEl = document.createElement('div');
    stageEl.className = 'video-overlay-stage';
    stageEl.title = t('fullscreenHint');
    stageEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      toggleStageFullscreen();
    });

    videoPanel.replaceChildren();
    videoPanel.append(videoCloseBtn, stageEl, dock.seek, dock.timeRow, dock.controls);
    injectCastIntoToggleRow(dock.controls, castRow);
    document.body.classList.add('video-overlay-open');

    playerMount.classList.remove('player-mount-hidden');
    playerMount.classList.add('player-mount-overlay');

    positionListener = () => positionPlayerOverStage();
    window.addEventListener('resize', positionListener);
    stageObserver = new ResizeObserver(() => positionPlayerOverStage());
    stageObserver.observe(stageEl);
    stageObserver.observe(videoPanel);

    playerMount.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      toggleStageFullscreen();
    });

    bindOverlayKeys();

    requestAnimationFrame(() => {
      positionPlayerOverStage();
      void ctrl.attachVideoSurface().then(() => {
        ctrl.restorePlayback(pos, shouldPlay);
        options.onPlayIcon?.(shouldPlay);
      });
    });
  }

  function close(): void {
    if (!overlayOpen) return;

    const ctrl = options.controller();
    const shouldPlay = ctrl.wantsPlayback();
    const pos = ctrl.getPlaybackTime();

    overlayOpen = false;
    stageEl = null;
    if (positionListener) {
      window.removeEventListener('resize', positionListener);
      positionListener = null;
    }
    stageObserver?.disconnect();
    stageObserver = null;
    unbindOverlayKeys();

    removeCastFromControls(castRow);

    if (document.fullscreenElement === playerMount) {
      void document.exitFullscreen();
    }

    playerMount.classList.add('player-mount-hidden');
    playerMount.classList.remove('player-mount-overlay');
    playerMount.style.left = '';
    playerMount.style.top = '';
    playerMount.style.width = '';
    playerMount.style.height = '';

    ctrl.hideVideoSurface();
    options.dockControls();

    videoOverlay.hidden = true;
    if (videoOverlay.isConnected) videoOverlay.remove();
    document.body.classList.remove('video-overlay-open');

    ctrl.restorePlayback(pos, shouldPlay);
    options.onPlayIcon?.(shouldPlay);
  }

  videoBackdrop.onclick = () => options.onUserClose();
  videoCloseBtn.onclick = (e) => {
    e.stopPropagation();
    options.onUserClose();
  };
  videoPanel.onclick = (e) => e.stopPropagation();

  return {
    playerHost,
    playerMount,
    sync(showVideo: boolean) {
      if (showVideo) open();
      else close();
    },
    isOpen: () => overlayOpen,
    destroy() {
      close();
      unbindOverlayKeys();
      playerMount.remove();
      if (videoOverlay.isConnected) videoOverlay.remove();
      document.body.classList.remove('video-overlay-open');
    },
  };
}
