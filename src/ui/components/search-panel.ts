import type { VideoEntry } from '@/core/models/workspace';
import { youtubeThumbUrl } from '@/core/models/workspace';
import { t } from '@/i18n';
import { bindHaptic } from '@/ui/haptics';

export function openSearchPanel(
  videos: VideoEntry[],
  onPick: (video: VideoEntry, index: number) => void
): void {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  const modal = document.createElement('div');
  modal.className = 'modal glass search-modal';

  const h = document.createElement('h2');
  h.textContent = t('search');
  const input = document.createElement('input');
  input.className = 'inline-input';
  input.placeholder = t('searchPlaceholder');
  const results = document.createElement('div');
  results.className = 'search-results';

  const close = () => overlay.remove();
  const x = document.createElement('button');
  x.className = 'btn btn-icon';
  x.textContent = '✕';
  x.onclick = close;

  function runSearch(): void {
    results.innerHTML = '';
    const q = input.value.trim().toLowerCase();
    if (q.length < 3) return;
    const words = q.split(/\s+/).filter((w) => w.length > 2);
    const matches = videos.filter((v) => {
      const title = v.title.toLowerCase();
      return words.every((w) => title.includes(w));
    });
    if (!matches.length) {
      results.textContent = t('searchNoResults');
      return;
    }
    for (const v of matches.slice(0, 50)) {
      const idx = videos.findIndex((x) => x.videoId === v.videoId);
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'search-row';
      row.innerHTML = `<img src="${youtubeThumbUrl(v.videoId)}" alt="" loading="lazy" /><span>${esc(v.title)}</span>`;
      row.onclick = () => {
        onPick(v, idx);
        close();
      };
      bindHaptic(row);
      results.appendChild(row);
    }
  }

  input.addEventListener('input', runSearch);
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };

  modal.append(h, input, results, x);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  input.focus();
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

export function renderThumbnailGrid(
  container: HTMLElement,
  videos: VideoEntry[],
  currentIndex: number,
  onSelect: (index: number) => void
): void {
  container.innerHTML = '';
  container.className = 'thumb-grid';
  videos.forEach((v, i) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'thumb-cell' + (i === currentIndex ? ' active' : '');
    cell.innerHTML = `<img src="${youtubeThumbUrl(v.videoId)}" alt="" loading="lazy" /><span>${esc(v.title)}</span>`;
    cell.onclick = () => onSelect(i);
    bindHaptic(cell);
    container.appendChild(cell);
  });
}
