import type { YouTubePlayerController } from '@/core/youtube/player';
import {
  castToChromecast,
  isChromecastSupported,
  promptCast,
  shouldShowAirPlay,
  shouldShowChromecast,
} from '@/core/playback/remote-playback';
import { iconButton } from '@/ui/icons';
import { t } from '@/i18n';
import { bindHaptic } from '@/ui/haptics';
import { showToast } from '@/app/toast';

export function createCastButtonGroup(options: {
  controller: () => YouTubePlayerController;
  getCastTitle?: () => string | undefined;
}): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'video-overlay-cast';
  wrap.setAttribute('role', 'group');
  wrap.setAttribute('aria-label', t('castGroup'));

  const airplayBtn = iconButton('airplay', t('airplay'));
  airplayBtn.className = 'btn btn-icon btn-icon-svg video-cast-btn';
  airplayBtn.hidden = !shouldShowAirPlay();
  airplayBtn.onclick = (e) => {
    e.stopPropagation();
    void promptCast({
      controller: options.controller(),
      title: options.getCastTitle?.(),
      prefer: 'airplay',
    });
  };

  const chromecastBtn = iconButton('chromecast', t('chromecast'));
  chromecastBtn.className = 'btn btn-icon btn-icon-svg video-cast-btn';
  chromecastBtn.hidden = !shouldShowChromecast();
  if (shouldShowChromecast()) {
    void isChromecastSupported().then((ok) => {
      chromecastBtn.hidden = !ok;
    });
  }
  chromecastBtn.onclick = (e) => {
    e.stopPropagation();
    const videoId = options.controller().getCurrentVideoId();
    if (!videoId) {
      showToast(t('castNoVideo'));
      return;
    }
    void castToChromecast(videoId, options.getCastTitle?.());
  };

  bindHaptic(airplayBtn);
  bindHaptic(chromecastBtn);
  wrap.append(airplayBtn, chromecastBtn);
  return wrap;
}

/** Insert cast buttons left of Sequential | Random in overlay toggle row. */
export function injectCastIntoToggleRow(controls: HTMLElement, castRow: HTMLElement): void {
  const toggles = controls.querySelector('.controls-row-toggles');
  const segmented = toggles?.querySelector('.segmented');
  if (!toggles) return;
  if (castRow.parentElement === toggles) return;
  toggles.insertBefore(castRow, segmented ?? toggles.firstChild);
}

export function removeCastFromControls(castRow: HTMLElement): void {
  if (castRow.isConnected) castRow.remove();
}
