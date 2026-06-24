import { hapticTap } from '@/ui/haptics';

export function createSeekBar(
  onSeek: (fraction: number) => void,
  getLabel?: () => string
): { el: HTMLElement; update: (current: number, duration: number) => void } {
  const wrap = document.createElement('div');
  wrap.className = 'seek-bar';
  wrap.setAttribute('role', 'slider');
  wrap.setAttribute('aria-label', getLabel?.() ?? 'Seek');

  const track = document.createElement('div');
  track.className = 'seek-track';
  const fill = document.createElement('div');
  fill.className = 'seek-fill';
  const thumb = document.createElement('div');
  thumb.className = 'seek-thumb';
  track.append(fill, thumb);
  wrap.appendChild(track);

  let duration = 0;

  function seekFromEvent(e: MouseEvent | TouchEvent): void {
    const rect = track.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    hapticTap(8);
    onSeek(frac);
  }

  track.addEventListener('mousedown', (e) => {
    seekFromEvent(e);
    const move = (ev: MouseEvent) => seekFromEvent(ev);
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });

  track.addEventListener('touchstart', (e) => {
    seekFromEvent(e);
  }, { passive: true });

  function update(current: number, dur: number): void {
    duration = dur;
    const pct = dur > 0 ? (current / dur) * 100 : 0;
    fill.style.width = `${pct}%`;
    thumb.style.left = `${pct}%`;
  }

  return { el: wrap, update };
}

export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
