import { VOLUME_SLIDER_MAX } from '@/core/youtube/player';
import { t } from '@/i18n';
import { icons } from '@/ui/icons';

export function createOrderSegment(
  initialRandom: boolean,
  onChange: (random: boolean) => void
): HTMLElement {
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

export function createVolumeSlider(onChange: (v: number) => void, initial = 100): HTMLElement {
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
  input.max = String(VOLUME_SLIDER_MAX);
  input.value = String(initial);
  input.className = 'volume-slider';
  input.oninput = () => onChange(Number(input.value));
  wrap.append(icon, input);
  return wrap;
}
